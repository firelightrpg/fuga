// =======================================================
// Meyda check will be performed inside DOMContentLoaded.
// =======================================================
let meydaIsReady = false;

// =======================================================
// Musical Constants
// =======================================================
const A4_FREQ = 440;
const C4_FREQ = A4_FREQ * Math.pow(2, -9/12); // ~261.63 Hz
const SEMITONE_RATIO = Math.pow(2, 1/12);
const CENT_RATIO = Math.pow(2, 1/1200); // For fine-tuning calculations
const PITCH_TOLERANCE_CENTS = 50; // How many cents off is acceptable (50 cents = 1/2 semitone)

const allIntervalSemitones = [
    1,  // Minor 2nd
    2,  // Major 2nd
    3,  // Minor 3rd
    4,  // Major 3rd
    5,  // Perfect 4th
    6,  // Tritone
    7,  // Perfect 5th
    8,  // Minor 6th
    9,  // Major 6th
    10, // Minor 7th
    11, // Major 7th
    12  // Octave
];

const orderedIntervals = [
    {semitones: 1, name: "Minor 2nd"},
    {semitones: 2, name: "Major 2nd"},
    {semitones: 3, name: "Minor 3rd"},
    {semitones: 4, name: "Major 3rd"},
    {semitones: 5, name: "Perfect 4th"},
    {semitones: 6, name: "Tritone"},
    {semitones: 7, name: "Perfect 5th"},
    {semitones: 8, name: "Minor 6th"},
    {semitones: 9, name: "Major 6th"},
    {semitones: 10, name: "Minor 7th"},
    {semitones: 11, name: "Major 7th"},
    {semitones: 12, name: "Octave"}
];

const intervalNames = {
    1: "Minor 2nd",
    2: "Major 2nd",
    3: "Minor 3rd",
    4: "Major 3rd",
    5: "Perfect 4th",
    6: "Tritone",
    7: "Perfect 5th",
    8: "Minor 6th",
    9: "Major 6th",
    10: "Minor 7th",
    11: "Major 7th",
    12: "Octave"
};

// =======================================================
// Game State Variables
// =======================================================
let currentCorrectIntervalSemitones = 0;
let currentCorrectIntervalName = '';
let isPlaying = false; // For recognition mode

// Production Mode State
let isProductionMode = false;
let isListening = false; // Track microphone state
let productionChallengeIntervalSemitones = 0;
let userMelodyPlayback = []; // Stores the frequencies to play back the user's detected melody

// =======================================================
// Web Audio API Setup
// =======================================================
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let micStream = null;
let meydaAnalyzer = null;

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
    const randomIndex = Math.floor(Math.random() * allIntervalSemitones.length);
    return allIntervalSemitones[randomIndex];
}

/**
 * Calculates the difference in semitones between two frequencies.
 * @param {number} freq1 - The first frequency in Hz.
 * @param {number} freq2 - The second frequency in Hz.
 * @returns {number} The absolute difference in semitones.
 */
function calculateSemitoneDifference(freq1, freq2) {
    if (freq1 <= 0 || freq2 <= 0) return 0; // Avoid log(0) and division by zero
    return 12 * Math.abs(Math.log2(freq2 / freq1));
}

/**
 * Calculates the difference in cents between two frequencies.
 * @param {number} freq1 - The first frequency in Hz.
 * @param {number} freq2 - The second frequency in Hz.
 * @returns {number} The absolute difference in cents.
 */
function calculateCentDifference(freq1, freq2) {
    if (freq1 <= 0 || freq2 <= 0) return 0;
    return 1200 * Math.abs(Math.log2(freq2 / freq1));
}

/**
 * Determines if two frequencies are within a certain cent tolerance.
 * @param {number} freq1 - The first frequency in Hz.
 * @param {number} freq2 - The second frequency in Hz.
 * @param {number} toleranceCents - The maximum acceptable difference in cents.
 * @returns {boolean} True if frequencies are within tolerance, false otherwise.
 */
function areFrequenciesInTune(freq1, freq2, toleranceCents) {
    if (freq1 <= 0 || freq2 <= 0) return false;
    return calculateCentDifference(freq1, freq2) <= toleranceCents;
}

// =======================================================
// UI Elements and Event Listeners (DOM References)
// =======================================================

// Recognition Mode elements
const playButton = document.getElementById('playIntervalButton');
const userGuessSelect = document.getElementById('userGuessSelect');
const submitGuessButton = document.getElementById('submitGuessButton');

// Production Mode elements
const toggleModeButton = document.getElementById('toggleModeButton');
const recognitionModeDiv = document.getElementById('recognitionMode');
const productionModeDiv = document.getElementById('productionMode');
const modeDescriptionP = document.getElementById('modeDescription');
const challengeDisplaySpan = document.getElementById('challengeDisplay');
const pitchDisplaySpan = document.getElementById('pitchDisplay');
const startProductionChallengeButton = document.getElementById('startProductionChallengeButton');
const stopProductionChallengeButton = document.getElementById('stopProductionChallengeButton');
const resetProductionChallengeButton = document.getElementById('resetProductionChallengeButton');
const playUserIntervalButton = document.getElementById('playUserIntervalButton');

const feedbackDiv = document.getElementById('feedback');

// Function to populate the dropdown
function populateIntervalDropdown() {
    userGuessSelect.innerHTML = '<option value="">-- Select your guess --</option>';
    orderedIntervals.forEach(interval => {
        const option = document.createElement('option');
        option.value = interval.semitones;
        option.textContent = interval.name;
        userGuessSelect.appendChild(option);
    });
}


// =======================================================
// Meyda and Pitch Detection Setup (Functions)
// =======================================================

async function startPitchDetection() {
    if (isListening) {
        return;
    }
    
    if (!meydaIsReady) {
        feedbackDiv.textContent = "Cannot start listening: Audio library (Meyda) not ready.";
        feedbackDiv.className = 'wrong';
        return;
    }

    try {
        feedbackDiv.textContent = 'Requesting microphone access...';
        feedbackDiv.className = '';

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(micStream);

        if (meydaAnalyzer) {
            meydaAnalyzer.stop();
        }

        meydaAnalyzer = Meyda.createAnalyzer({
            audioContext: audioContext,
            source: source,
            bufferSize: 2048,
            featureExtractors: ['yin'],
            callback: features => {
                if (isListening && features.pitch && features.pitch > 50) {
                    const detectedFreq = features.pitch;
                    pitchDisplaySpan.textContent = `${detectedFreq.toFixed(2)} Hz`;

                    if (userMelodyPlayback.length < 2) {
                        const lastPitch = userMelodyPlayback[userMelodyPlayback.length - 1];
                        const minDiffForNewNote = 100;
                        
                        if (!lastPitch || Math.abs(detectedFreq - lastPitch) > minDiffForNewNote) {
                            userMelodyPlayback.push(detectedFreq);
                            if (userMelodyPlayback.length === 2) {
                                stopPitchDetection();
                                evaluateProductionChallenge();
                            }
                        }
                    }
                } else {
                    pitchDisplaySpan.textContent = `-- Hz`;
                }
            }
        });

        meydaAnalyzer.start();
        isListening = true;

        feedbackDiv.textContent = 'Listening for your notes...';
        feedbackDiv.className = '';
        startProductionChallengeButton.style.display = 'none';
        stopProductionChallengeButton.style.display = 'inline-block';
        resetProductionChallengeButton.style.display = 'inline-block';
        playUserIntervalButton.style.display = 'none';

    } catch (err) {
        console.error("CRITICAL ERROR in startPitchDetection:", err); 
        feedbackDiv.textContent = "Error during microphone setup. Please ensure access and try again.";
        feedbackDiv.className = 'wrong';
        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
        }
        isListening = false;
        stopPitchDetection(); 
    }
}

function stopPitchDetection() {
    if (meydaAnalyzer) {
        meydaAnalyzer.stop();
        meydaAnalyzer = null;
    }

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    isListening = false;

    feedbackDiv.textContent = 'Microphone stopped.';
    startProductionChallengeButton.style.display = 'inline-block';
    stopProductionChallengeButton.style.display = 'none';
    
    if (userMelodyPlayback.length === 0) {
        resetProductionChallengeButton.style.display = 'none';
        playUserIntervalButton.style.display = 'none';
    } else {
        resetProductionChallengeButton.style.display = 'inline-block';
        playUserIntervalButton.style.display = 'inline-block';
    }
}

function resetProductionChallenge() {
    if (isListening) {
        stopPitchDetection();
    }
    
    userMelodyPlayback = [];
    productionChallengeIntervalSemitones = 0;
    challengeDisplaySpan.textContent = '';
    pitchDisplaySpan.textContent = '-- Hz';
    feedbackDiv.textContent = '';
    feedbackDiv.className = '';
    startProductionChallengeButton.style.display = 'inline-block';
    stopProductionChallengeButton.style.display = 'none';
    resetProductionChallengeButton.style.display = 'none';
    playUserIntervalButton.style.display = 'none';
    startProductionChallengeButton.textContent = 'Start Listening';
}

function startNewProductionChallenge() {
    resetProductionChallenge();
    productionChallengeIntervalSemitones = getRandomIntervalInSemitones();
    challengeDisplaySpan.textContent = intervalNames[productionChallengeIntervalSemitones];
    feedbackDiv.textContent = `Play a ${intervalNames[productionChallengeIntervalSemitones]} (melodically).`;
    feedbackDiv.className = '';
    startProductionChallengeButton.textContent = 'Start Listening';
}

function evaluateProductionChallenge() {
    if (userMelodyPlayback.length < 2) {
        feedbackDiv.textContent = "Please play two distinct notes for the interval.";
        feedbackDiv.className = 'wrong';
        return;
    }

    const firstNoteFreq = userMelodyPlayback[0];
    const secondNoteFreq = userMelodyPlayback[1];

    const playedSemitones = calculateSemitoneDifference(firstNoteFreq, secondNoteFreq);
    const roundedPlayedSemitones = Math.round(playedSemitones);

    if (roundedPlayedSemitones === productionChallengeIntervalSemitones) {
        feedbackDiv.textContent = `CORRECT! You played a ${intervalNames[productionChallengeIntervalSemitones]}.`;
        feedbackDiv.className = 'correct';
    } else {
        const playedIntervalName = intervalNames[roundedPlayedSemitones] || `an unknown interval (${roundedPlayedSemitones} semitones)`;
        feedbackDiv.textContent = `WRONG. You played ${playedIntervalName}. The challenge was a ${intervalNames[productionChallengeIntervalSemitones]}.`;
        feedbackDiv.className = 'wrong';
    }

    playUserIntervalButton.style.display = 'inline-block';
    startProductionChallengeButton.textContent = 'Start New Challenge';
}

function playUserPlayedInterval() {
    if (userMelodyPlayback.length < 2) {
        feedbackDiv.textContent = "No interval was played by you to play back.";
        feedbackDiv.className = 'wrong';
        return;
    }

    const now = audioContext.currentTime;
    const noteDuration = 0.8;
    const intervalPlayDuration = (noteDuration * 2) + 0.2;

    playNote(userMelodyPlayback[0], now, noteDuration);
    playNote(userMelodyPlayback[1], now + noteDuration + 0.1, noteDuration);

    feedbackDiv.textContent = "Playing back your interval...";
    feedbackDiv.className = '';

    setTimeout(() => {
        feedbackDiv.textContent = '';
    }, intervalPlayDuration * 1000);
}


// =======================================================
// Event Listeners (UI Logic)
// =======================================================

toggleModeButton.addEventListener('click', () => {
    isProductionMode = !isProductionMode;
    if (isProductionMode) {
        recognitionModeDiv.classList.remove('active');
        productionModeDiv.classList.add('active');
        modeDescriptionP.textContent = 'Produce the challenge interval.';
        toggleModeButton.textContent = 'Switch to Recognition Mode';
        startNewProductionChallenge();
    } else {
        stopPitchDetection();
        resetProductionChallenge();
        recognitionModeDiv.classList.add('active');
        productionModeDiv.classList.remove('active');
        modeDescriptionP.textContent = 'Guess the interval.';
        toggleModeButton.textContent = 'Switch to Production Mode';
    }
    feedbackDiv.textContent = '';
    feedbackDiv.className = '';
});


playButton.addEventListener('click', () => {
    if (isPlaying) return;

    isPlaying = true;
    feedbackDiv.textContent = '';
    feedbackDiv.className = '';
    userGuessSelect.value = '';

    const now = audioContext.currentTime;
    const noteDuration = 0.8;
    const intervalPlayDuration = (noteDuration * 2) + 0.2;

    const rootFreq = C4_FREQ;
    const intervalSemitones = getRandomIntervalInSemitones();
    const intervalFreq = rootFreq * Math.pow(SEMITONE_RATIO, intervalSemitones);

    currentCorrectIntervalSemitones = intervalSemitones;
    currentCorrectIntervalName = intervalNames[intervalSemitones] || `Unknown Interval (${intervalSemitones} semitones)`;

    const playHarmonic = Math.random() < 0.5;

    if (playHarmonic) {
        playNote(rootFreq, now, noteDuration * 2);
        playNote(intervalFreq, now, noteDuration * 2);
    } else {
        playNote(rootFreq, now, noteDuration);
        playNote(intervalFreq, now + noteDuration + 0.1, noteDuration);
    }

    setTimeout(() => {
        isPlaying = false;
    }, intervalPlayDuration * 1000);
});

submitGuessButton.addEventListener('click', () => {
    const userSelectedSemitones = parseInt(userGuessSelect.value, 10); 
    
    if (isNaN(userSelectedSemitones)) {
        feedbackDiv.textContent = "Please select an interval from the list.";
        feedbackDiv.className = 'wrong';
        return;
    }

    if (userSelectedSemitones === currentCorrectIntervalSemitones) {
        feedbackDiv.textContent = `CORRECT! That was a ${currentCorrectIntervalName}.`;
        feedbackDiv.className = 'correct';
    } else {
        feedbackDiv.textContent = `WRONG. That was a ${currentCorrectIntervalName} (${currentCorrectIntervalSemitones} semitones). Try again!`;
        feedbackDiv.className = 'wrong';
    }
});


// Production Mode Event Listeners (new)
startProductionChallengeButton.addEventListener('click', startPitchDetection);
stopProductionChallengeButton.addEventListener('click', stopPitchDetection);
resetProductionChallengeButton.addEventListener('click', startNewProductionChallenge);
playUserIntervalButton.addEventListener('click', playUserPlayedInterval);


// Initial setup when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    if (typeof Meyda === 'object' && Meyda !== null && typeof Meyda.createAnalyzer === 'function') {
        meydaIsReady = true;
    } else {
        feedbackDiv.textContent = "FATAL ERROR: Audio library (Meyda) failed to load. Please check console.";
        feedbackDiv.className = 'wrong';
        toggleModeButton.disabled = true;
        startProductionChallengeButton.disabled = true;
    }

    populateIntervalDropdown(); 

    stopProductionChallengeButton.style.display = 'none';
    resetProductionChallengeButton.style.display = 'none';
    playUserIntervalButton.style.display = 'none';
    
    recognitionModeDiv.classList.add('active');
    productionModeDiv.classList.remove('active');
    toggleModeButton.textContent = 'Switch to Production Mode';
    modeDescriptionP.textContent = 'Guess the interval.';
});