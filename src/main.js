import { PitchDetector } from "pitchy";
import './style.css';

// =======================================================
// Musical Constants
// =======================================================
const A4_FREQ = 440;
const C4_FREQ = A4_FREQ * Math.pow(2, -9/12); // ~261.63 Hz
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
// UI Elements
// =======================================================
const playButton = document.getElementById('playIntervalButton');
const userGuessSelect = document.getElementById('userGuessSelect');
const submitGuessButton = document.getElementById('submitGuessButton');
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

// =======================================================
// Game State & Audio Setup
// =======================================================
let currentCorrectIntervalSemitones = 0;
let currentCorrectIntervalName = '';
let isPlaying = false;
let isProductionMode = false;
let isListening = false;
let productionChallengeIntervalSemitones = 0;
let userMelodyPlayback = [];

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let micStream = null;
let analyserNode = null;
let animationFrameId = null; // To control the detection loop

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

// --- PITCH DETECTION LOGIC (using pitchy) ---
function updatePitch(detector, input, sampleRate) {
    const [pitch, clarity] = detector.findPitch(input, sampleRate);
    
    if (clarity > 0.95 && pitch > 50) { // Clarity threshold to filter noise
        const detectedFreq = pitch;
        pitchDisplaySpan.textContent = `${detectedFreq.toFixed(2)} Hz`;

        if (userMelodyPlayback.length < 2) {
            const lastPitch = userMelodyPlayback[userMelodyPlayback.length - 1];
            // Use a semitone difference to register a new note, which is more musical
            if (!lastPitch || Math.abs(calculateSemitoneDifference(detectedFreq, lastPitch)) > 0.8) {
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
    
    if(isListening) {
        animationFrameId = requestAnimationFrame(() => {
            analyserNode.getFloatTimeDomainData(input);
            updatePitch(detector, input, sampleRate);
        });
    }
}


async function startPitchDetection() {
    if (isListening) return;
    try {
        feedbackDiv.textContent = 'Requesting microphone access...';
        if (audioContext.state === 'suspended') await audioContext.resume();

        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(micStream);
        
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048; // Standard FFT size for pitch detection
        source.connect(analyserNode);

        const detector = PitchDetector.forFloat32Array(analyserNode.fftSize);
        const input = new Float32Array(detector.inputLength);
        
        isListening = true;
        updatePitch(detector, input, audioContext.sampleRate); // Start the detection loop

        feedbackDiv.textContent = 'Listening for your notes...';
        feedbackDiv.className = '';
        startProductionChallengeButton.style.display = 'none';
        stopProductionChallengeButton.style.display = 'inline-block';
        resetProductionChallengeButton.style.display = 'inline-block';
        playUserIntervalButton.style.display = 'none';
    } catch (err) {
        console.error("ERROR in startPitchDetection:", err);
        feedbackDiv.textContent = "Error during microphone setup. Please ensure access and try again.";
        feedbackDiv.className = 'wrong';
        stopPitchDetection(); // Ensure cleanup on failure
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
    if (isListening) stopPitchDetection();
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
}

function evaluateProductionChallenge() {
    if (userMelodyPlayback.length < 2) return;
    const playedSemitones = calculateSemitoneDifference(userMelodyPlayback[0], userMelodyPlayback[1]);
    const roundedPlayedSemitones = Math.round(playedSemitones);
    if (roundedPlayedSemitones === productionChallengeIntervalSemitones) {
        feedbackDiv.textContent = `CORRECT! You played a ${intervalNames[productionChallengeIntervalSemitones]}.`;
        feedbackDiv.className = 'correct';
    } else {
        const playedIntervalName = intervalNames[roundedPlayedSemitones] || `an unknown interval`;
        feedbackDiv.textContent = `WRONG. You played ${playedIntervalName}. The challenge was a ${intervalNames[productionChallengeIntervalSemitones]}.`;
        feedbackDiv.className = 'wrong';
    }
    playUserIntervalButton.style.display = 'inline-block';
    startProductionChallengeButton.textContent = 'Start New Challenge';
}

function playUserPlayedInterval() {
    if (userMelodyPlayback.length < 2) return;
    const now = audioContext.currentTime;
    playNote(userMelodyPlayback[0], now, 0.8);
    playNote(userMelodyPlayback[1], now + 0.9, 0.8);
}

// =======================================================
// Event Listeners
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
    userGuessSelect.value = '';
    const now = audioContext.currentTime;
    const rootFreq = C4_FREQ;
    const intervalSemitones = getRandomIntervalInSemitones();
    currentCorrectIntervalSemitones = intervalSemitones;
    currentCorrectIntervalName = intervalNames[intervalSemitones];
    const intervalFreq = rootFreq * Math.pow(SEMITONE_RATIO, intervalSemitones);
    if (Math.random() < 0.5) {
        playNote(rootFreq, now, 1.6);
        playNote(intervalFreq, now, 1.6);
    } else {
        playNote(rootFreq, now, 0.8);
        playNote(intervalFreq, now + 0.9, 0.8);
    }
    setTimeout(() => { isPlaying = false; }, 1800);
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
        feedbackDiv.textContent = `WRONG. That was a ${currentCorrectIntervalName}. Try again!`;
        feedbackDiv.className = 'wrong';
    }
});

startProductionChallengeButton.addEventListener('click', startPitchDetection);
stopProductionChallengeButton.addEventListener('click', stopPitchDetection);
resetProductionChallengeButton.addEventListener('click', startNewProductionChallenge);
playUserIntervalButton.addEventListener('click', playUserPlayedInterval);

// =======================================================
// Initial UI State Setup
// =======================================================
const populateIntervalDropdown = () => {
    userGuessSelect.innerHTML = '<option value="">-- Select your guess --</option>';
    orderedIntervals.forEach(interval => {
        const option = document.createElement('option');
        option.value = interval.semitones;
        option.textContent = interval.name;
        userGuessSelect.appendChild(option);
    });
};
populateIntervalDropdown();
stopProductionChallengeButton.style.display = 'none';
resetProductionChallengeButton.style.display = 'none';
playUserIntervalButton.style.display = 'none';
recognitionModeDiv.classList.add('active');
productionModeDiv.classList.remove('active');
modeDescriptionP.textContent = 'Guess the interval.';
toggleModeButton.textContent = 'Switch to Production Mode';