<script>
  import { onMount } from 'svelte';
  import { PitchDetector } from "pitchy";

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
  // Reactive State
  // =======================================================
  let isProductionMode = false;
  let modeDescription = 'I will play an interval. You guess it.';
  let toggleButtonText = 'Switch to Perform Mode';
  let challengeText = '';
  let pitchText = '-- Hz';
  let feedbackText = '';
  let feedbackClass = '';
  let userGuess = '';
  
  // Visibility flags for buttons
  let showStopButton = false;
  let showNextButton = false;
  let showPlayMyIntervalButton = false;
  let startButtonText = 'Start Listening';

  // =======================================================
  // Game State & Audio Setup
  // =======================================================
  let currentCorrectIntervalSemitones = 0;
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

  onMount(() => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  });

  // =======================================================
  // Core Functions
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
      showStopButton = true;
      showNextButton = true;
      showPlayMyIntervalButton = false;
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
    showStopButton = false;
    if (userMelodyPlayback.length < 1) { 
      showNextButton = false;
      showPlayMyIntervalButton = false;
    } else {
      showNextButton = true;
      showPlayMyIntervalButton = userMelodyPlayback.length === 2;
    }
  }

  function resetProductionChallenge() {
    if (isListening) stopPitchDetection();
    userMelodyPlayback = [];
    challengeText = '';
    pitchText = '-- Hz';
    feedbackText = '';
    feedbackClass = '';
    showStopButton = false;
    showNextButton = false;
    showPlayMyIntervalButton = false;
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
    showPlayMyIntervalButton = true;
    startButtonText = 'Repeat This Interval';
  }

  function playUserPlayedInterval() {
    if (userMelodyPlayback.length < 2) return;
    const now = audioContext.currentTime;
    playNote(userMelodyPlayback[0], now, 0.8);
    playNote(userMelodyPlayback[1], now + 0.9, 0.8);
  }

  // =======================================================
  // Event Handlers
  // =======================================================
  function handleToggleMode() {
    isProductionMode = !isProductionMode;
    if (isProductionMode) {
      modeDescription = 'I will give you an interval. You perform it.';
      toggleButtonText = 'Switch to Guessing Mode';
      startNewProductionChallenge();
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
</script>

<main>
  <h1>Fuga - Ear Trainer</h1>
  <p>{modeDescription}</p>

  <button class="toggle" on:click={handleToggleMode}>{toggleButtonText}</button>

  <div id="recognitionMode" class:active={!isProductionMode}>
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

  <div id="productionMode" class:active={isProductionMode}>
      <p>Challenge: <span>{challengeText}</span></p>
      <p>Your Pitch: <span>{pitchText}</span></p>
      {#if !showStopButton}
        <button on:click={startPitchDetection}>{startButtonText}</button>
      {/if}
      {#if showStopButton}
        <button on:click={stopPitchDetection}>Stop Listening</button>
      {/if}
      {#if showNextButton}
        <button on:click={startNewProductionChallenge}>Next Interval</button>
      {/if}
      {#if showPlayMyIntervalButton}
        <button on:click={playUserPlayedInterval}>Play My Interval</button>
      {/if}
  </div>

  <div id="feedback" class={feedbackClass}>{feedbackText}</div>
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
    justify-content: center;
    min-height: 100vh;
    text-align: center;
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

  #feedback {
    margin-top: 20px;
    font-size: 1.2em;
    font-weight: bold;
  }

  .correct { color: #28a745; }
  .wrong { color: #dc3545; }

  #pitchDisplay {
    margin-top: 15px;
    font-size: 1.5em;
    font-weight: bold;
    color: #007bff;
  }

  #challengeDisplay {
    margin-top: 15px;
    font-size: 1.3em;
    font-weight: bold;
    color: #333;
  }

  #recognitionMode, #productionMode {
    display: none;
    flex-direction: column;
    align-items: center;
  }

  #recognitionMode.active, #productionMode.active {
    display: flex;
  }
</style>