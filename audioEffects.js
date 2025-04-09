// New file for audio effects to refactor audio.js which reached max length

// Create various audio effects
export function createReverb(context, timeInSeconds = 1) {
  return new Promise((resolve) => {
    const sampleRate = context.sampleRate;
    const length = sampleRate * timeInSeconds;
    const impulse = context.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    // Create the impulse
    for (let i = 0; i < length; i++) {
      const n = i / length;
      // Decay curve
      const t = i / sampleRate;
      const decay = Math.exp(-t * 3);
      
      // Random values between -1 and 1
      impulseL[i] = (Math.random() * 2 - 1) * decay;
      impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    
    const convolver = context.createConvolver();
    convolver.buffer = impulse;
    
    const reverbGain = context.createGain();
    reverbGain.gain.value = 0.3; // Reverb wet level
    
    convolver.connect(reverbGain);
    
    resolve(reverbGain);
  });
}

export function createSynth(context, masterGain, reverb, { type, attack, decay, sustain, release }) {
  return (note, duration = 0.25) => {
    // Convert note to frequency if it's a string
    const freq = typeof note === 'string' ? noteToFrequency(note) : note;
    
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    
    const gainNode = context.createGain();
    gainNode.gain.value = 0;
    
    // Connect to reverb and master
    oscillator.connect(gainNode);
    gainNode.connect(reverb);
    reverb.connect(masterGain);
    
    // Start oscillator
    oscillator.start();
    
    // ADSR envelope
    const now = context.currentTime;
    gainNode.gain.linearRampToValueAtTime(0.8, now + attack);
    gainNode.gain.linearRampToValueAtTime(sustain * 0.8, now + attack + decay);
    gainNode.gain.setValueAtTime(sustain * 0.8, now + duration - release);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);
    
    // Stop and disconnect
    setTimeout(() => {
      oscillator.stop();
      oscillator.disconnect();
      gainNode.disconnect();
    }, (duration + 0.1) * 1000);
  };
}

export function createDrumSynth(context, masterGain, reverb) {
  return (_, duration = 0.1) => {
    const noise = context.createBufferSource();
    const bufferSize = context.sampleRate * 0.5;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);
    
    // Fill buffer with noise
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    noise.buffer = buffer;
    
    const gainNode = context.createGain();
    gainNode.gain.value = 0;
    
    // Filter to shape the noise
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 440;
    filter.Q.value = 0.7;
    
    // Connect
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(reverb);
    reverb.connect(masterGain);
    
    // Start noise
    noise.start();
    
    // Envelope
    const now = context.currentTime;
    gainNode.gain.linearRampToValueAtTime(0.8, now + 0.005);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);
    
    // Stop and disconnect
    setTimeout(() => {
      noise.stop();
      noise.disconnect();
      filter.disconnect();
      gainNode.disconnect();
    }, (duration + 0.1) * 1000);
  };
}

export function createFMSynth(context, masterGain, reverb, { modRatio, modAmount, attack, decay, sustain, release }) {
  return (note, duration = 0.25) => {
    const freq = typeof note === 'string' ? noteToFrequency(note) : note;
    
    // Carrier
    const carrier = context.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    
    // Modulator
    const modulator = context.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq * modRatio;
    
    // Modulation gain
    const modGain = context.createGain();
    modGain.gain.value = modAmount * (freq / 100); // Scale mod amount by frequency
    
    // Output gain
    const gainNode = context.createGain();
    gainNode.gain.value = 0;
    
    // Connect
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(gainNode);
    gainNode.connect(reverb);
    reverb.connect(masterGain);
    
    // Start oscillators
    carrier.start();
    modulator.start();
    
    // ADSR envelope
    const now = context.currentTime;
    gainNode.gain.linearRampToValueAtTime(0.8, now + attack);
    gainNode.gain.linearRampToValueAtTime(sustain * 0.8, now + attack + decay);
    gainNode.gain.setValueAtTime(sustain * 0.8, now + duration - release);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);
    
    // Stop and disconnect
    setTimeout(() => {
      carrier.stop();
      modulator.stop();
      carrier.disconnect();
      modulator.disconnect();
      modGain.disconnect();
      gainNode.disconnect();
    }, (duration + 0.1) * 1000);
  };
}

export function noteToFrequency(note) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  // Parse the note and octave (e.g., "C4", "F#5")
  let octave = parseInt(note.slice(-1));
  let noteName = note.slice(0, -1);
  
  // Handle flats (e.g., "Eb4")
  if (noteName.includes('b')) {
    const flatNote = noteName.replace('b', '');
    const flatIndex = notes.indexOf(flatNote);
    if (flatIndex > 0) {
      noteName = notes[flatIndex - 1];
    } else {
      noteName = notes[11]; // B if the flat note was C
      octave -= 1;
    }
  }
  
  // Get the note index
  const noteIndex = notes.indexOf(noteName);
  
  if (noteIndex === -1) {
    console.error('Invalid note:', note);
    return 440; // Default to A4
  }
  
  // Calculate frequency (A4 = 440Hz)
  const a4Index = 9 + 12 * 4; // A4 is the 9th note (0-indexed) in the 4th octave
  const currentIndex = noteIndex + 12 * octave;
  const halfStepsFromA4 = currentIndex - a4Index;
  
  return 440 * Math.pow(2, halfStepsFromA4 / 12);
}

// Generate notes based on scale
export function generateNotes(scale, startOctave, numRows, scales) {
  const notes = [];
  const selectedScale = scales[scale];
  let currentOctave = startOctave + Math.floor(numRows / selectedScale.length);
  
  for (let i = 0; i < numRows; i++) {
    const scaleIndex = (numRows - 1 - i) % selectedScale.length;
    if (scaleIndex === selectedScale.length - 1 && i !== 0) {
      currentOctave--;
    }
    notes.push(`${selectedScale[scaleIndex]}${currentOctave}`);
  }
  
  return notes;
}