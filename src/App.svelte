<script>
  import { onMount } from 'svelte';
  import { PitchDetector } from "pitchy";
  import Fretboard from './lib/Fretboard.svelte';

  // =======================================================
  // App-Level State
  // =======================================================
  let appMode = 'interval'; // 'interval' or 'fretboard'

  // =======================================================
  // Musical Constants
  // =======================================================
  const A4_FREQ = 440;
  const C4_FREQ = A4_FREQ * Math.pow(2, -9/12);
  const SEMITONE_RATIO = Math.pow(2, 1/12);

  const orderedIntervals = [
      {semitones: 1, name: "Minor 2nd"}, {semitones: 2, name: "Major 2nd"},
      {semitones: 3, name: "Minor 3rd"}, {semitones: 4, name: "Major 3rd"},
      {semitones: 5, name: "Perfect 4th"}, {semitones: 6, name: "Tritone"},
      {semitones: 7, name: "Perfect 5th"}, {semitones: 8, name: "Minor 6th"},
      {semitones: 9, name: "Major 6th"}, {semitones: 10, name: "Minor 7th"},
      {semitones: 11, name: "Major 7th"}, {semitones: 12, name: "Octave"}
  ];
  const intervalNames = Object.fromEntries(orderedIntervals.map(i => [i.semitones, i.name]));
  const allIntervalSemitones = orderedIntervals.map(i => i.semitones);

  // =======================================================
  // Reactive State (for Interval Mode)
  // =======================================================
  let isPerformMode = false;
  let modeDescription = 'I will play an interval. You guess it.';
  let toggleButtonText = 'Switch to Perform Mode';
  let challengeText = '';
  let pitchText = '-- Hz';
  let feedbackText = '';
  let feedbackClass = '';
  let userGuess = '';

  // =======================================================
  // Reactive State (for Fretboard Mode)
  // =======================================================
  let fretboardChallengeMode = 'find-note'; // 'find-note' or 'identify-note'
  let fretboardChallengeNote = '';
  let fretboardChallengePosition = null; // { string: number, fret: number }
  let fretboardFeedback = '';
  
  let startButtonText = 'Start Listening';

  // =======================================================
  // Game State & Audio Setup
  // =======================================================
  let currentCorrectIntervalSemitones = 0;
  let productionChallengeIntervalSemitones = 0;
  let currentCorrectIntervalName = '';
  let isPlaying = false;
  let isListening = false;
  let userMelodyPlayback = [];

  let audioContext;
  let micStream = null;
  let analyserNode = null;
  let animationFrameId = null;

  let pitchCandidate = null;
  let pitchConfidence = 0;
  let hasBeenSilentAfterFirstNote = false;
  let pitchBuffer = [];
  const REQUIRED_CONFIDENCE = 5; 
  const CLARITY_THRESHOLD = 0.9;
  const PITCH_WINDOW_SEMITONES = 0.5;

  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const stringNotes = [{ string: 1, note: 'E', octave: 4 }, { string: 2, note: 'B', octave: 3 }, { string: 3, note: 'G', octave: 3 }, { string: 4, note: 'D', octave: 3 }, { string: 5, note: 'A', octave: 2 }, { string: 6, note: 'E', octave: 2 }];


  onMount(() => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  });

  // =======================================================
  // Interval Mode Functions
  // =======================================================
  function playNote(frequency, startTime, duration, waveform = 'sine') {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.1);
  }

  function getRandomIntervalInSemitones() {
    return allIntervalSemitones[Math.floor(Math.random() * allIntervalSemitones.length)];
  }

  function calculateSemitoneDifference(freq1, freq2) {
    if (freq1 <= 0 || freq2 <= 0) return 0;
    return 12 * Math.abs(Math.log2(freq2 / freq1));
  }

  function updatePitch(detector, input, sampleRate) {
    if (!isListening) return;

    analyserNode.getFloatTimeDomainData(input);
    const [pitch, clarity] = detector.findPitch(input, sampleRate);
    
    if (userMelodyPlayback.length === 1 && clarity < CLARITY_THRESHOLD) {
      hasBeenSilentAfterFirstNote = true;
    }

    if (clarity > CLARITY_THRESHOLD && pitch > 50) {
      pitchText = `${pitch.toFixed(2)} Hz`;

      if (pitchCandidate && Math.abs(calculateSemitoneDifference(pitch, pitchCandidate)) < PITCH_WINDOW_SEMITONES) {
        pitchConfidence++;
        pitchBuffer.push(pitch);
      } else {
        pitchCandidate = pitch;
        pitchConfidence = 1;
        pitchBuffer = [pitch];
      }

      if (pitchConfidence === REQUIRED_CONFIDENCE) {
        const averagePitch = pitchBuffer.reduce((a, b) => a + b, 0) / pitchBuffer.length;
        
        if (userMelodyPlayback.length === 0) {
          userMelodyPlayback.push(averagePitch);
        } 
        else if (userMelodyPlayback.length === 1 && hasBeenSilentAfterFirstNote) {
          userMelodyPlayback.push(averagePitch);
          stopPitchDetection();
          evaluateProductionChallenge();
          return; 
        }
        pitchConfidence = 0; 
      }
    } else {
      pitchText = `-- Hz`;
      pitchCandidate = null;
      pitchConfidence = 0;
      pitchBuffer = [];
    }
    
    animationFrameId = requestAnimationFrame(() => updatePitch(detector, input, sampleRate));
  }

  async function startPitchDetection() {
    if (isListening) return;
    try {
      feedbackText = 'Requesting microphone access...';
      if (audioContext.state === 'suspended') await audioContext.resume();

      userMelodyPlayback = [];
      pitchCandidate = null;
      pitchConfidence = 0;
      hasBeenSilentAfterFirstNote = false;
      pitchBuffer = [];
      
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContext.createMediaStreamSource(micStream);
      
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);

      const detector = PitchDetector.forFloat32Array(analyserNode.fftSize);
      const input = new Float32Array(detector.inputLength);
      
      isListening = true;
      updatePitch(detector, input, audioContext.sampleRate);

      feedbackText = 'Listening for your notes...';
      feedbackClass = '';
    } catch (err) {
      console.error("ERROR in startPitchDetection:", err);
      feedbackText = "Error during microphone setup. Please ensure access and try again.";
      feedbackClass = 'wrong';
      stopPitchDetection();
    }
  }

  function stopPitchDetection() {
    isListening = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (analyserNode) {
      analyserNode.disconnect();
      analyserNode = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    feedbackText = 'Microphone stopped.';
  }

  function resetProductionChallenge() {
    if (isListening) stopPitchDetection();
    userMelodyPlayback = [];
    challengeText = '';
    pitchText = '-- Hz';
    feedbackText = '';
    feedbackClass = '';
    startButtonText = 'Start Listening';
  }

  function startNewProductionChallenge() {
    resetProductionChallenge();
    const newIntervalSemitones = getRandomIntervalInSemitones();
    productionChallengeIntervalSemitones = newIntervalSemitones;
    challengeText = intervalNames[newIntervalSemitones];
    feedbackText = `Perform a ${intervalNames[newIntervalSemitones]}.`;
  }

  function evaluateProductionChallenge() {
    if (userMelodyPlayback.length < 2) return;
    const playedSemitones = calculateSemitoneDifference(userMelodyPlayback[0], userMelodyPlayback[1]);
    const roundedPlayedSemitones = Math.round(playedSemitones);
    if (roundedPlayedSemitones === productionChallengeIntervalSemitones) {
      feedbackText = `CORRECT! You performed a ${intervalNames[productionChallengeIntervalSemitones]}.`;
      feedbackClass = 'correct';
    } else {
      const playedIntervalName = intervalNames[roundedPlayedSemitones] || `an unknown interval`;
      feedbackText = `WRONG. You performed ${playedIntervalName}. The challenge was a ${intervalNames[productionChallengeIntervalSemitones]}.`;
      feedbackClass = 'wrong';
    }
    startButtonText = 'Repeat This Interval';
  }

  function playUserPlayedInterval() {
    if (userMelodyPlayback.length < 2) return;
    const now = audioContext.currentTime;
    playNote(userMelodyPlayback[0], now, 0.8);
    playNote(userMelodyPlayback[1], now + 0.9, 0.8);
  }

  function handleToggleMode() {
    isPerformMode = !isPerformMode;
    if (isPerformMode) {
      modeDescription = 'I will give you an interval. You perform it.';
      toggleButtonText = 'Switch to Guessing Mode';
      startNewProductionChallenge(); // THIS LINE WAS MISSING
    } else {
      stopPitchDetection();
      resetProductionChallenge();
      modeDescription = 'I will play an interval. You guess it.';
      toggleButtonText = 'Switch to Perform Mode';
    }
    feedbackText = '';
    feedbackClass = '';
  }

  function handlePlayRandomInterval() {
    if (isPlaying) return;
    isPlaying = true;
    userGuess = '';
    const now = audioContext.currentTime;
    const rootFreq = C4_FREQ;
    const intervalSemitones = getRandomIntervalInSemitones();
    currentCorrectIntervalSemitones = intervalSemitones;
    currentCorrectIntervalName = intervalNames[intervalSemitones];
    const intervalFreq = rootFreq * Math.pow(SEMITONE_RATIO, intervalSemitones);
    const playHarmonic = Math.random() < 0.5;

    if (playHarmonic) {
      playNote(rootFreq, now, 1.6);
      playNote(intervalFreq, now, 1.6);
    } else {
      playNote(rootFreq, now, 0.8);
      playNote(intervalFreq, now + 0.9, 0.8);
    }
    setTimeout(() => { isPlaying = false; }, 1800);
  }

  function handleSubmitGuess() {
    const userSelectedSemitones = parseInt(userGuess, 10);
    if (isNaN(userSelectedSemitones)) {
      feedbackText = "Please select an interval from the list.";
      feedbackClass = 'wrong';
      return;
    }
    if (userSelectedSemitones === currentCorrectIntervalSemitones) {
      feedbackText = `CORRECT! That was a ${currentCorrectIntervalName}.`;
      feedbackClass = 'correct';
    } else {
      feedbackText = `WRONG. That was a ${currentCorrectIntervalName}. Try again!`;
      feedbackClass = 'wrong';
    }
  }

  // =======================================================
  // Fretboard Mode Functions
  // =======================================================
  function startNewFretboardChallenge() {
    fretboardFeedback = 'New challenge started!';
    // TODO: Implement fretboard challenge logic
  }

  function handleFretboardNoteSelected(event) {
    // TODO: Implement note selection handling
    console.log('Fret selected:', event.detail);
  }
</script>

<main>
  <h1>Fuga - Ear Trainer</h1>
  
  <div class="app-mode-switcher">
    <button class:active={appMode === 'interval'} on:click={() => appMode = 'interval'}>
      Interval Training
    </button>
    <button class:active={appMode === 'fretboard'} on:click={() => appMode = 'fretboard'}>
      Fretboard Training
    </button>
  </div>

  {#if appMode === 'interval'}
    <div class="module-container">
      <p>{modeDescription}</p>

      <button class="toggle" on:click={handleToggleMode}>{toggleButtonText}</button>

      <div class="mode-content" class:active={!isPerformMode}>
          <div style="margin-bottom: 20px;">
              <button on:click={handlePlayRandomInterval}>Play Random Interval</button>
          </div>
          <div>
              <select bind:value={userGuess}>
                  <option value="">-- Select your guess --</option>
                  {#each orderedIntervals as interval}
                    <option value={interval.semitones}>{interval.name}</option>
                  {/each}
              </select>
              <button on:click={handleSubmitGuess}>Submit Answer</button>
          </div>
      </div>

      <div class="mode-content" class:active={isPerformMode}>
          <p>Challenge: <span>{challengeText}</span></p>
          <p class="tip"><em>Tip: Perform mode only works with melodic intervals. Sing or play each note separately using staccato (short, detached notes) for best results.</em></p>
          <p>Your Pitch: <span>{pitchText}</span></p>
          {#if !isListening}
            <button on:click={startPitchDetection}>{startButtonText}</button>
          {/if}
          {#if isListening}
            <button on:click={stopPitchDetection}>Stop Listening</button>
          {/if}
          {#if !isListening && userMelodyPlayback.length > 0}
            <button on:click={startNewProductionChallenge}>Next Interval</button>
          {/if}
          {#if !isListening && userMelodyPlayback.length === 2}
            <button on:click={playUserPlayedInterval}>Play My Interval</button>
          {/if}
      </div>

      <div class="feedback" class:correct={feedbackClass === 'correct'} class:wrong={feedbackClass === 'wrong'}>
        {feedbackText}
      </div>
    </div>
  {:else if appMode === 'fretboard'}
    <div class="module-container">
      <h2>Fretboard Training</h2>
      <p>{fretboardFeedback}</p>
      <div class="app-mode-switcher">
        <button class:active={fretboardChallengeMode === 'find-note'} on:click={() => { fretboardChallengeMode = 'find-note'; startNewFretboardChallenge(); }}>
          Find Note
        </button>
        <button class:active={fretboardChallengeMode === 'identify-note'} on:click={() => { fretboardChallengeMode = 'identify-note'; startNewFretboardChallenge(); }}>
          Identify Note
        </button>
      </div>
      <button on:click={startNewFretboardChallenge}>New Fretboard Challenge</button>

      <div class="fretboard-wrapper">
        <!--
          Conceptual props for Fretboard.svelte:
          - challengeMode: 'find-note' or 'identify-note'
          - challengeNote: The note name to find (e.g., 'C#')
          - challengePosition: { string: number, fret: number } to display a dot
          - on:fretSelected: Event emitted when a user clicks a fret, carrying { string, fret, note }
        -->
        <Fretboard
          challengeMode={fretboardChallengeMode}
          challengeNote={fretboardChallengeNote}
          challengePosition={fretboardChallengePosition}
          on:fretSelected={handleFretboardNoteSelected}
        />
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    font-family: sans-serif;
    margin: 0;
    background-color: #f4f4f4;
    color: #333;
  }

  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
    padding-top: 2rem;
    text-align: center;
  }
  
  .app-mode-switcher {
    margin-bottom: 2rem;
    border: 1px solid #ccc;
    border-radius: 5px;
    overflow: hidden;
  }

  .app-mode-switcher button {
    margin: 0;
    border-radius: 0;
    background-color: #f0f0f0;
    color: #333;
    border: none;
  }
  
  .app-mode-switcher button.active {
    background-color: #007bff;
    color: white;
  }
  
  .module-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .fretboard-wrapper {
    width: 90%;
    max-width: 800px;
    margin: 1rem auto;
  }

  button, select {
    padding: 10px 20px;
    margin: 5px;
    font-size: 1.1em;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  button {
    background-color: #4CAF50;
    color: white;
  }

  button:hover {
    background-color: #45a049;
  }

  .toggle {
    background-color: #007bff;
  }

  .toggle:hover {
    background-color: #0056b3;
  }

  select {
    border: 1px solid #ccc;
    background-color: white;
    min-width: 200px;
    height: 44px;
    cursor: pointer;
  }

  .feedback {
    margin-top: 20px;
    font-size: 1.2em;
    font-weight: bold;
  }

  .correct { color: #28a745; }
  .wrong { color: #dc3545; }
  
  .mode-content {
    display: none;
    flex-direction: column;
    align-items: center;
  }

  .mode-content.active {
    display: flex;
  }
</style>