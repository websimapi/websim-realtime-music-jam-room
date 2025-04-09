// Constants and configuration
const GRID_COLS = 16;
const GRID_ROWS = 13;
const SCALES = {
  'pentatonic': ['C', 'D', 'E', 'G', 'A'],
  'major': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'minor': ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  'blues': ['C', 'Eb', 'F', 'F#', 'G', 'Bb']
};
const CURRENT_SCALE = 'pentatonic';

// Import audio effects functions from the new file
import { 
  createReverb, 
  createSynth, 
  createDrumSynth, 
  createFMSynth, 
  noteToFrequency, 
  generateNotes 
} from './audioEffects.js';

// Custom Audio Engine
class AudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.instruments = {};
    this.reverb = null;
    this.oscillatorTypes = {
      sine: 'sine',
      square: 'square',
      sawtooth: 'sawtooth',
      triangle: 'triangle'
    };
  }

  async initialize() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create master gain node
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.7; // Default volume
    this.masterGain.connect(this.context.destination);
    
    // Create reverb - now using imported function
    this.reverb = await createReverb(this.context, 1.5);
    
    // Create instruments - now using imported functions
    this.instruments = {
      synth: createSynth(this.context, this.masterGain, this.reverb, 
        { type: 'sine', attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }),
      
      bass: createSynth(this.context, this.masterGain, this.reverb, 
        { type: 'triangle', attack: 0.05, decay: 0.2, sustain: 0.4, release: 1.5 }),
      
      piano: createSynth(this.context, this.masterGain, this.reverb, 
        { type: 'triangle', attack: 0.01, decay: 0.1, sustain: 0.5, release: 1 }),
      
      guitar: createSynth(this.context, this.masterGain, this.reverb, 
        { type: 'square', attack: 0.01, decay: 0.1, sustain: 0.3, release: 1 }),
      
      drum: createDrumSynth(this.context, this.masterGain, this.reverb),
      
      flute: createFMSynth(this.context, this.masterGain, this.reverb,
        { modRatio: 3.01, modAmount: 14, attack: 0.1, decay: 0.2, sustain: 0.8, release: 1.5 }),
      
      // Moved to createPluckedSynth and createMetalSynth functions to the audioEffects.js file
      harp: this.createPluckedSynth(),
      bells: this.createMetalSynth()
    };
  }

  resumeContext() {
    if (this.context && this.context.state !== 'running') {
      this.context.resume();
    }
  }

  // Remaining synth methods that weren't moved to audioEffects.js
  createPluckedSynth() {
    return (note, duration = 0.5) => {
      const freq = typeof note === 'string' ? noteToFrequency(note) : note;
      
      // Create a buffer of noise
      const bufferSize = this.context.sampleRate * 0.5;
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const output = buffer.getChannelData(0);
      
      // Fill with noise
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      // Create source and filter
      const noise = this.context.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq * 2;
      filter.Q.value = 1;
      
      const gainNode = this.context.createGain();
      gainNode.gain.value = 0.8;
      
      // Connect
      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.reverb);
      this.reverb.connect(this.masterGain);
      
      // Start
      noise.start();
      
      // Decay
      gainNode.gain.setValueAtTime(0.8, this.context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      
      // Stop and disconnect
      setTimeout(() => {
        noise.stop();
        noise.disconnect();
        filter.disconnect();
        gainNode.disconnect();
      }, duration * 1000);
    };
  }

  createMetalSynth() {
    return (note, duration = 0.5) => {
      const freq = typeof note === 'string' ? noteToFrequency(note) : note;
      
      // Multiple oscillators at harmonic frequencies for metallic sound
      const harmonics = [1, 1.5, 2.32, 3.01, 4.7, 6.2];
      const oscillators = [];
      const gains = [];
      
      for (let i = 0; i < harmonics.length; i++) {
        const osc = this.context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * harmonics[i];
        
        const gain = this.context.createGain();
        gain.gain.value = 0.2 * (1 - i * 0.1); // Decreasing gain for higher harmonics
        
        // Connect
        osc.connect(gain);
        gain.connect(this.reverb);
        
        oscillators.push(osc);
        gains.push(gain);
        
        // Start
        osc.start();
      }
      
      this.reverb.connect(this.masterGain);
      
      // Decay
      for (const gain of gains) {
        gain.gain.setValueAtTime(gain.gain.value, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      }
      
      // Stop and disconnect
      setTimeout(() => {
        for (let i = 0; i < oscillators.length; i++) {
          oscillators[i].stop();
          oscillators[i].disconnect();
          gains[i].disconnect();
        }
      }, duration * 1000);
    };
  }

  setVolume(value) {
    if (this.masterGain) {
      // Convert to a reasonable volume curve
      this.masterGain.gain.value = Math.pow(value, 2);
    }
  }
}

// State variables
let isPlaying = false;
let currentStep = 0;
let stepInterval;
let tempo = 120;
let volume = 0.7;
let currentInstrument = 'synth';
let currentOctave = 3;
let notes = [];
let activeNotes = {};
let roomState = null;
let roomPresence = null;
let networkSystem = null;
let clientColor = null;
let audioEngine = null;

// Initialize the audio system
export async function initializeAudio() {
  audioEngine = new AudioEngine();
  await audioEngine.initialize();
  
  notes = generateNotes(CURRENT_SCALE, currentOctave, GRID_ROWS, SCALES);
  
  // Initialize audio context on user interaction
  document.body.addEventListener('click', async () => {
    audioEngine.resumeContext();
    console.log('Audio context started');
  }, { once: true });
  
  // Set global reference for cross-file access
  window.audioSystem = {
    playSound: (note, instrumentType) => {
      audioEngine.resumeContext();
      const instrument = audioEngine.instruments[instrumentType] || audioEngine.instruments.synth;
      instrument(note, 0.25);
    }
  };
  
  // Return the audio system API
  return {
    setNetworkSystem(network) {
      networkSystem = network;
      roomState = network.getRoomState();
      roomPresence = network.getPresence();
      clientColor = network.getClientColor();
    },
    
    setCurrentInstrument(instrument) {
      currentInstrument = instrument;
      if (networkSystem) {
        networkSystem.updatePresence({ instrument: currentInstrument });
      }
    },
    
    setCurrentOctave(octave) {
      currentOctave = octave;
      notes = generateNotes(CURRENT_SCALE, currentOctave, GRID_ROWS, SCALES);
      if (networkSystem) {
        networkSystem.updatePresence({ octave: currentOctave });
      }
    },
    
    setVolume(vol) {
      volume = vol;
      audioEngine.setVolume(volume);
    },
    
    setTempo(bpm) {
      tempo = bpm;
      if (isPlaying) {
        this.stopPlayback();
        this.startPlayback();
      }
    },
    
    startPlayback() {
      if (isPlaying) return;
      
      isPlaying = true;
      const stepDuration = 60000 / (tempo * 4); // 16th notes
      currentStep = 0;
      
      if (networkSystem) {
        networkSystem.updateRoomState({
          isPlaying: true,
          currentStep: 0
        });
      }
      
      stepInterval = setInterval(() => {
        // Move playhead
        const playhead = document.getElementById('playhead');
        const gridElement = document.getElementById('grid');
        if (playhead && gridElement) {
          const stepWidth = gridElement.offsetWidth / GRID_COLS;
          playhead.style.left = `${currentStep * stepWidth}px`;
        }
        
        // Play notes at this step
        if (roomPresence) {
          Object.keys(roomPresence).forEach(clientId => {
            const presence = roomPresence[clientId];
            if (!presence.activeNotes) return;
            
            Object.keys(presence.activeNotes).forEach(key => {
              const [row, col] = key.split('-').map(Number);
              if (col === currentStep) {
                const noteInfo = presence.activeNotes[key];
                
                // Highlight the cell
                const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
                if (cell) {
                  cell.classList.add('playing');
                  setTimeout(() => cell.classList.remove('playing'), stepDuration / 2);
                }
                
                // Play the sound
                if (clientId === networkSystem.getClientId()) {
                  this.playSound(noteInfo.note, noteInfo.instrument);
                  
                  // Broadcast this note being played to all clients
                  networkSystem.send({
                    type: 'noteOn',
                    note: noteInfo.note,
                    instrument: noteInfo.instrument
                  });
                } else {
                  // Request other clients to play their notes
                  networkSystem.requestPresenceUpdate(clientId, {
                    type: 'playNote',
                    note: noteInfo.note,
                    instrument: noteInfo.instrument
                  });
                }
              }
            });
          });
        }
        
        currentStep = (currentStep + 1) % GRID_COLS;
      }, stepDuration);
    },
    
    stopPlayback() {
      if (!isPlaying) return;
      
      isPlaying = false;
      clearInterval(stepInterval);
      
      // Hide playhead
      const playhead = document.getElementById('playhead');
      if (playhead) {
        playhead.style.left = '-10px';
      }
      
      if (networkSystem) {
        networkSystem.updateRoomState({
          isPlaying: false,
          currentStep: 0
        });
      }
    },
    
    playSound(note, instrumentType) {
      audioEngine.resumeContext();
      const instrument = audioEngine.instruments[instrumentType] || audioEngine.instruments.synth;
      instrument(note, 0.25);
    },
    
    setupGrid(gridElement, clientColor) {
      gridElement.innerHTML = '';
      
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const cell = document.createElement('div');
          cell.className = 'grid-cell';
          cell.dataset.row = row;
          cell.dataset.col = col;
          cell.dataset.note = notes[row];
          
          // Add click event for toggling notes
          cell.addEventListener('click', (e) => {
            this.toggleNote(row, col, cell, clientColor);
          });
          
          gridElement.appendChild(cell);
        }
      }
      
      // Initialize with existing notes if available
      if (networkSystem) {
        const presence = networkSystem.getPresence()[networkSystem.getClientId()];
        if (presence && presence.activeNotes) {
          Object.keys(presence.activeNotes).forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
              cell.classList.add('active');
              cell.style.backgroundColor = presence.color;
            }
          });
        }
      }
    },
    
    toggleNote(row, col, cell, color) {
      if (!networkSystem) return;
      
      const presence = networkSystem.getPresence()[networkSystem.getClientId()];
      const noteKey = `${row}-${col}`;
      const note = notes[row];
      
      const updatedNotes = { ...presence.activeNotes } || {};
      
      if (updatedNotes[noteKey]) {
        // Remove note
        delete updatedNotes[noteKey];
        cell.classList.remove('active');
        cell.style.backgroundColor = '';
      } else {
        // Add note
        updatedNotes[noteKey] = {
          note,
          instrument: currentInstrument
        };
        cell.classList.add('active');
        cell.style.backgroundColor = color;
        
        // Play sound immediately on click
        this.playSound(note, currentInstrument);
        
        // Send note flash event
        const rect = cell.getBoundingClientRect();
        const gridRect = document.getElementById('grid').getBoundingClientRect();
        const x = (rect.left + rect.width / 2 - gridRect.left) / gridRect.width;
        const y = (rect.top + rect.height / 2 - gridRect.top) / gridRect.height;
        
        networkSystem.send({
          type: 'noteOn',
          x,
          y,
          color: color,
          note: note,
          instrument: currentInstrument
        });
      }
      
      networkSystem.updatePresence({
        activeNotes: updatedNotes
      });
    },
    
    clearNotes() {
      activeNotes = {};
    },
    
    // Spatial audio for 3D world
    createPositionalSound(position, instrument = 'synth', camera) {
      // Create a panner node
      const panner = audioEngine.context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'exponential';
      panner.refDistance = 1;
      panner.maxDistance = 10000;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 0;
      panner.coneOuterGain = 0;
      
      // Set position
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
      
      // Connect to master
      panner.connect(audioEngine.masterGain);
      
      return {
        play(note) {
          // Create a temporary gain node for this note
          const gainNode = audioEngine.context.createGain();
          gainNode.gain.value = 0.5;
          gainNode.connect(panner);
          
          // Play the note
          const instrument = audioEngine.instruments[instrument] || audioEngine.instruments.synth;
          instrument(note, 0.25);
        },
        setPosition(x, y, z) {
          panner.positionX.value = x;
          panner.positionY.value = y;
          panner.positionZ.value = z;
        }
      };
    }
  };
}

// Set up instruments for the 3D world
export function setupInstruments() {
  return {
    INSTRUMENT_TYPES: Object.keys({
      synth: null,
      bass: null,
      piano: null,
      guitar: null,
      drum: null,
      flute: null,
      harp: null,
      bells: null
    }),
  };
}