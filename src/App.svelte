<script>
  import { onMount } from 'svelte';
  import { PitchDetector } from "pitchy";
  import Fretboard from './lib/Fretboard.svelte';

  // =======================================================
  // App-Level State
  // =======================================================
  let appMode = 'interval'; // 'interval' or 'fretboard'
  let darkMode = false;

  // =======================================================
  // Musical Constants
  // =======================================================
  const A4_FREQ = 440;
  const C4_FREQ = A4_FREQ * Math.pow(2, -9/12);
  const SEMITONE_RATIO = Math.pow(2, 1/12);

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  const GUITAR_STRINGS = [
    { name: 'e', openNote: 'E', octave: 4 },
    { name: 'B', openNote: 'B', octave: 3 },
    { name: 'G', openNote: 'G', octave: 3 },
    { name: 'D', openNote: 'D', octave: 3 },
    { name: 'A', openNote: 'A', octave: 2 },
    { name: 'E', openNote: 'E', octave: 2 }
  ];

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
  
  // Timer settings for perform mode
  let performTimerDuration = 5; // seconds between challenges
  let performShowResultsDuration = 2; // seconds to show results before next challenge
  let performTimerActive = false;
  let performTimeRemaining = 0;
  let performTimerInterval = null;

  // =======================================================
  // Reactive State (for Fretboard Mode)
  // =======================================================
  let fretboardChallengeMode = 'find-note-click'; // 'find-note-click', 'find-note-perform', or 'identify-note'
  let fretboardChallengeNote = '';
  let fretboardChallengeString = null; // null = random string, or 0-5 for specific string
  let fretboardActualTargetString = null; // The actual string for the current challenge
  let fretboardChallengePosition = null; // { string: number, fret: number }
  let fretboardAnswerDots = []; // Array of {string, fret} showing all positions of a note
  let fretboardUserGuess = ''; // User's note guess in identify-note mode
  let fretboardFeedback = '';
  let fretboardFeedbackClass = '';
  let fretboardIsListening = false;
  let fretboardDetectedNote = '';
  
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
    
    // Auto-start listening and timer in perform mode
    if (isPerformMode) {
      setTimeout(() => {
        startPitchDetection();
      }, 100);
    }
  }

  function evaluateProductionChallenge() {
    if (userMelodyPlayback.length < 2) return;
    const playedSemitones = calculateSemitoneDifference(userMelodyPlayback[0], userMelodyPlayback[1]);
    const roundedPlayedSemitones = Math.round(playedSemitones);
    if (roundedPlayedSemitones === productionChallengeIntervalSemitones) {
      feedbackText = `CORRECT! You performed a ${intervalNames[productionChallengeIntervalSemitones]}.`;
      feedbackClass = 'correct';
      
      // Stop the timer and show results briefly before next challenge
      stopPerformTimer();
      setTimeout(() => {
        if (isPerformMode) {
          startNewProductionChallenge();
          startPerformTimer();
        }
      }, performShowResultsDuration * 1000);
    } else {
      const playedIntervalName = intervalNames[roundedPlayedSemitones] || `an unknown interval`;
      feedbackText = `WRONG. You performed ${playedIntervalName}. Try again for ${intervalNames[productionChallengeIntervalSemitones]}.`;
      feedbackClass = 'wrong';
      
      // Keep the same challenge, reset for another attempt
      resetProductionChallenge();
      challengeText = intervalNames[productionChallengeIntervalSemitones];
      feedbackText = `WRONG. You performed ${playedIntervalName}. Try again for ${intervalNames[productionChallengeIntervalSemitones]}.`;
      
      // Restart timer and listening after brief delay
      setTimeout(() => {
        if (isPerformMode) {
          startPitchDetection();
          startPerformTimer();
        }
      }, 1500);
    }
    startButtonText = 'Repeat This Interval';
  }

  function playUserPlayedInterval() {
    if (userMelodyPlayback.length < 2) return;
    const now = audioContext.currentTime;
    playNote(userMelodyPlayback[0], now, 0.8);
    playNote(userMelodyPlayback[1], now + 0.9, 0.8);
  }

  function startPerformTimer() {
    stopPerformTimer();
    performTimerActive = true;
    performTimeRemaining = performTimerDuration;
    
    performTimerInterval = setInterval(() => {
      performTimeRemaining--;
      if (performTimeRemaining <= 0) {
        // Timer expired, auto-advance to next challenge
        handlePerformTimerExpired();
      }
    }, 1000);
  }

  function stopPerformTimer() {
    performTimerActive = false;
    if (performTimerInterval) {
      clearInterval(performTimerInterval);
      performTimerInterval = null;
    }
  }

  function resetPerformTimer() {
    performTimeRemaining = performTimerDuration;
  }

  function handlePerformTimerExpired() {
    // Show brief "time's up" message if no answer given
    if (userMelodyPlayback.length < 2 && feedbackClass !== 'correct' && feedbackClass !== 'wrong') {
      feedbackText = "Time's up! Try again.";
      feedbackClass = 'wrong';
      
      // Keep the same challenge, restart timer after brief delay
      setTimeout(() => {
        resetProductionChallenge();
        challengeText = intervalNames[productionChallengeIntervalSemitones];
        feedbackText = `Perform a ${intervalNames[productionChallengeIntervalSemitones]}.`;
        startPitchDetection();
        resetPerformTimer();
      }, 1500);
    }
  }

  function handleToggleMode() {
    isPerformMode = !isPerformMode;
    if (isPerformMode) {
      modeDescription = 'I will give you an interval. You perform it.';
      toggleButtonText = 'Switch to Guessing Mode';
      startNewProductionChallenge();
      startPerformTimer();
    } else {
      stopPitchDetection();
      resetProductionChallenge();
      stopPerformTimer();
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
  
  // Get the semitone offset from C for a given note name
  function getNoteIndex(noteName) {
    return NOTE_NAMES.indexOf(noteName);
  }

  // Calculate all fret positions where a given note can be played
  function getNoteFretPositions(noteName, maxFret = 12) {
    const positions = [];
    const targetNoteIndex = getNoteIndex(noteName);
    
    if (targetNoteIndex === -1) return positions;
    
    GUITAR_STRINGS.forEach((string, stringIdx) => {
      const openNoteIndex = getNoteIndex(string.openNote);
      for (let fret = 0; fret <= maxFret; fret++) {
        const fretNoteIndex = (openNoteIndex + fret) % 12;
        if (fretNoteIndex === targetNoteIndex) {
          positions.push({ string: stringIdx, fret });
        }
      }
    });
    
    return positions;
  }

  // Get note name at a specific string and fret
  function getNoteAtPosition(stringIndex, fret) {
    const string = GUITAR_STRINGS[stringIndex];
    const openNoteIndex = getNoteIndex(string.openNote);
    const noteIndex = (openNoteIndex + fret) % 12;
    return NOTE_NAMES[noteIndex];
  }

  // Get a random note name
  function getRandomNote() {
    return NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)];
  }

  // Get a random fret position
  function getRandomFretPosition(maxFret = 12) {
    const stringIndex = Math.floor(Math.random() * GUITAR_STRINGS.length);
    const fret = Math.floor(Math.random() * (maxFret + 1));
    return { string: stringIndex, fret };
  }

  // Detect note name from frequency
  function frequencyToNoteName(frequency) {
    if (frequency <= 0) return null;
    // Calculate semitones from C0
    const semitonesFromC0 = 12 * Math.log2(frequency / 16.35);
    const noteIndex = Math.round(semitonesFromC0) % 12;
    return NOTE_NAMES[noteIndex];
  }

  async function startFretboardPitchDetection() {
    if (fretboardIsListening) return;
    try {
      fretboardFeedback = 'Requesting microphone access...';
      if (audioContext.state === 'suspended') await audioContext.resume();

      fretboardDetectedNote = '';
      
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContext.createMediaStreamSource(micStream);
      
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);

      const detector = PitchDetector.forFloat32Array(analyserNode.fftSize);
      const input = new Float32Array(detector.inputLength);
      
      fretboardIsListening = true;
      updateFretboardPitch(detector, input, audioContext.sampleRate);

      fretboardFeedback = `Play ${fretboardChallengeNote} on your instrument...`;
      fretboardFeedbackClass = '';
    } catch (err) {
      console.error("ERROR in startFretboardPitchDetection:", err);
      fretboardFeedback = "Error during microphone setup. Please ensure access and try again.";
      fretboardFeedbackClass = 'wrong';
      stopFretboardPitchDetection();
    }
  }

  function updateFretboardPitch(detector, input, sampleRate) {
    if (!fretboardIsListening) return;

    analyserNode.getFloatTimeDomainData(input);
    const [pitch, clarity] = detector.findPitch(input, sampleRate);

    if (clarity > CLARITY_THRESHOLD && pitch > 50) {
      const detectedNote = frequencyToNoteName(pitch);
      fretboardDetectedNote = `${detectedNote} (${pitch.toFixed(1)} Hz)`;

      if (detectedNote === fretboardChallengeNote) {
        fretboardFeedback = `CORRECT! You played ${fretboardChallengeNote}. Here are all positions:`;
        fretboardFeedbackClass = 'correct';
        fretboardAnswerDots = getNoteFretPositions(fretboardChallengeNote);
        stopFretboardPitchDetection();
        return;
      }
    } else {
      fretboardDetectedNote = '-- Hz';
    }
    
    animationFrameId = requestAnimationFrame(() => updateFretboardPitch(detector, input, sampleRate));
  }

  function stopFretboardPitchDetection() {
    fretboardIsListening = false;
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
  }

  function startNewFretboardChallenge() {
    fretboardAnswerDots = [];
    fretboardChallengePosition = null;
    fretboardUserGuess = '';
    fretboardFeedback = '';
    fretboardFeedbackClass = '';
    fretboardDetectedNote = '';
    if (fretboardIsListening) stopFretboardPitchDetection();
    
    if (fretboardChallengeMode === 'find-note-click') {
      // Challenge: click all positions of this note
      fretboardChallengeNote = getRandomNote();
      // If null, pick a random string for this challenge
      fretboardActualTargetString = fretboardChallengeString !== null 
        ? fretboardChallengeString 
        : Math.floor(Math.random() * GUITAR_STRINGS.length);
      const stringName = GUITAR_STRINGS[fretboardActualTargetString].name;
      fretboardFeedback = `Find ${fretboardChallengeNote} on the ${stringName} string.`;
    } else if (fretboardChallengeMode === 'find-note-perform') {
      // Challenge: perform this note on your instrument
      fretboardChallengeNote = getRandomNote();
      // If null, pick a random string for this challenge
      fretboardActualTargetString = fretboardChallengeString !== null 
        ? fretboardChallengeString 
        : Math.floor(Math.random() * GUITAR_STRINGS.length);
      const stringName = GUITAR_STRINGS[fretboardActualTargetString].name;
      fretboardFeedback = `Play ${fretboardChallengeNote} on the ${stringName} string.`;
    } else {
      // Challenge: identify the note at this position
      fretboardChallengePosition = getRandomFretPosition();
      fretboardChallengeNote = getNoteAtPosition(
        fretboardChallengePosition.string,
        fretboardChallengePosition.fret
      );
      fretboardFeedback = 'What note is at the highlighted position?';
    }
  }

  function handleFretboardNoteSelected(event) {
    const { string, fret } = event.detail;
    
    if (fretboardChallengeMode === 'find-note-click') {
      // User clicked a fret in find-note mode
      const clickedNote = getNoteAtPosition(string, fret);
      
      // Check if specific string was required
      if (string !== fretboardActualTargetString) {
        const wrongStringName = GUITAR_STRINGS[string].name;
        const correctStringName = GUITAR_STRINGS[fretboardActualTargetString].name;
        fretboardFeedback = `That's the ${wrongStringName} string. Find ${fretboardChallengeNote} on the ${correctStringName} string.`;
        fretboardFeedbackClass = 'wrong';
        return;
      }
      
      if (clickedNote === fretboardChallengeNote) {
        fretboardFeedback = `CORRECT! That's ${fretboardChallengeNote}. Here are all positions:`;
        fretboardFeedbackClass = 'correct';
        fretboardAnswerDots = getNoteFretPositions(fretboardChallengeNote);
      } else {
        fretboardFeedback = `WRONG. That's ${clickedNote}, not ${fretboardChallengeNote}. Try again!`;
        fretboardFeedbackClass = 'wrong';
      }
    }
  }

  function handleFretboardGuessSubmit() {
    if (!fretboardUserGuess) {
      fretboardFeedback = 'Please select a note from the list.';
      fretboardFeedbackClass = 'wrong';
      return;
    }
    
    if (fretboardUserGuess === fretboardChallengeNote) {
      fretboardFeedback = `CORRECT! That was ${fretboardChallengeNote}.`;
      fretboardFeedbackClass = 'correct';
    } else {
      fretboardFeedback = `WRONG. That was ${fretboardChallengeNote}, not ${fretboardUserGuess}.`;
      fretboardFeedbackClass = 'wrong';
    }
  }
</script>

<main class:dark-mode={darkMode}>
  <div class="header">
    <h1>Fuga - Ear Trainer</h1>
    <button class="dark-mode-toggle" on:click={() => darkMode = !darkMode}>
      {darkMode ? '☀️' : '🌙'}
    </button>
  </div>
  
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
              <select bind:value={userGuess} on:change={handleSubmitGuess}>
                  <option value="">-- Select your guess --</option>
                  {#each orderedIntervals as interval}
                    <option value={interval.semitones}>{interval.name}</option>
                  {/each}
              </select>
          </div>
      </div>

      <div class="mode-content" class:active={isPerformMode}>
          <div style="margin-bottom: 15px;">
            <label>
              Challenge timer:
              <input type="number" bind:value={performTimerDuration} min="3" max="60" step="1" style="width: 60px;" />
              seconds
            </label>
          </div>
          
          {#if performTimerActive}
            <div style="font-size: 1.5em; font-weight: bold; margin-bottom: 10px;">
              Time: {performTimeRemaining}s
            </div>
          {/if}
          
          <p>Challenge: <span>{challengeText}</span></p>
          <p class="tip"><em>Tip: Perform mode only works with melodic intervals. Sing or play each note separately using staccato (short, detached notes) for best results.</em></p>
          <p>Your Pitch: <span>{pitchText}</span></p>
          {#if !isListening}
            <button on:click={startPitchDetection}>{startButtonText}</button>
          {/if}
          {#if isListening}
            <button on:click={stopPitchDetection}>Stop Listening</button>
          {/if}
          {#if !performTimerActive && !isListening && userMelodyPlayback.length === 2}
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
      
      <div class="app-mode-switcher">
        <button class:active={fretboardChallengeMode === 'find-note-click'} on:click={() => { fretboardChallengeMode = 'find-note-click'; startNewFretboardChallenge(); }}>
          Find Note (Click)
        </button>
        <button class:active={fretboardChallengeMode === 'find-note-perform'} on:click={() => { fretboardChallengeMode = 'find-note-perform'; startNewFretboardChallenge(); }}>
          Find Note (Perform)
        </button>
        <button class:active={fretboardChallengeMode === 'identify-note'} on:click={() => { fretboardChallengeMode = 'identify-note'; startNewFretboardChallenge(); }}>
          Identify Note
        </button>
      </div>

      {#if fretboardChallengeMode === 'find-note-click' || fretboardChallengeMode === 'find-note-perform'}
        <div style="margin: 15px 0;">
          <label>
            Target string:
            <select bind:value={fretboardChallengeString} on:change={startNewFretboardChallenge}>
              <option value={null}>Random</option>
              {#each GUITAR_STRINGS as string, idx}
                <option value={idx}>{string.name} string ({string.openNote})</option>
              {/each}
            </select>
          </label>
        </div>
      {/if}

      <button on:click={startNewFretboardChallenge}>New Challenge</button>

      {#if fretboardChallengeMode === 'find-note-perform'}
        <div style="margin: 20px 0;">
          <p>Detected: <span>{fretboardDetectedNote}</span></p>
          {#if !fretboardIsListening}
            <button on:click={startFretboardPitchDetection}>Start Listening</button>
          {:else}
            <button on:click={stopFretboardPitchDetection}>Stop Listening</button>
          {/if}
        </div>
      {/if}

      <div class="fretboard-wrapper">
        <Fretboard
          answerDots={fretboardAnswerDots}
          challengeDot={fretboardChallengePosition}
          on:fretSelected={handleFretboardNoteSelected}
        />
      </div>

      {#if fretboardChallengeMode === 'identify-note'}
        <div style="margin-top: 20px;">
          <select bind:value={fretboardUserGuess} on:change={handleFretboardGuessSubmit}>
            <option value="">-- Select note --</option>
            {#each NOTE_NAMES as note}
              <option value={note}>{note}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="feedback" class:correct={fretboardFeedbackClass === 'correct'} class:wrong={fretboardFeedbackClass === 'wrong'}>
        {fretboardFeedback}
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
    transition: background-color 0.3s, color 0.3s;
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

  .header {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 1rem;
  }

  .dark-mode-toggle {
    padding: 8px 16px;
    font-size: 1.5em;
    background-color: transparent;
    border: 2px solid #ccc;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.3s;
  }

  .dark-mode-toggle:hover {
    background-color: rgba(128, 128, 128, 0.2);
  }

  /* Dark Mode Styles */
  main.dark-mode {
    background-color: #1a1a1a;
    color: #e0e0e0;
  }

  main.dark-mode :global(body) {
    background-color: #1a1a1a;
    color: #e0e0e0;
  }

  main.dark-mode .app-mode-switcher button {
    background-color: #2a2a2a;
    color: #e0e0e0;
    border-color: #444;
  }

  main.dark-mode .app-mode-switcher button.active {
    background-color: #0066cc;
  }

  main.dark-mode select {
    background-color: #2a2a2a;
    color: #e0e0e0;
    border-color: #444;
  }

  main.dark-mode button {
    background-color: #3a7d3f;
  }

  main.dark-mode button:hover {
    background-color: #2d6330;
  }

  main.dark-mode .toggle {
    background-color: #0066cc;
  }

  main.dark-mode .toggle:hover {
    background-color: #0052a3;
  }

  main.dark-mode .dark-mode-toggle {
    border-color: #666;
    color: #e0e0e0;
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