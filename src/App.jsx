import React, { useState, useRef, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Save, Smartphone, AlertCircle, Mic, Square, RotateCcw, Award } from 'lucide-react';

const App = () => (
  <div className="min-h-screen bg-gray-900 text-gray-100">
    <LayerCounter />
  </div>
);

const LayerCounter = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [expectedLayers, setExpectedLayers] = useState('');
  const [status, setStatus] = useState({ message: 'Ready to record', isError: false });
  const [analysis, setAnalysis] = useState(null);
  const [audioData, setAudioData] = useState(null);
  const [showGuide, setShowGuide] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const mediaRecorder = useRef(null);
  const audioContext = useRef(null);
  const recordedChunks = useRef([]);
  const timerInterval = useRef(null);
  const wakeLock = useRef(null);

  useEffect(() => {
    checkMicrophonePermission();
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
      if (wakeLock.current) wakeLock.current.release();
    };
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' });
      setPermissionGranted(result.state === 'granted');
      result.addEventListener('change', (e) => {
        setPermissionGranted(e.target.state === 'granted');
      });
    } catch (err) {
      console.warn('Permissions API not supported:', err);
    }
  };

  const Guide = () => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center">
          <Smartphone className="mr-2" size={24} /> Quick Setup Guide
        </h2>
        <button
          onClick={() => setShowGuide(false)}
          className="text-gray-400 hover:text-white"
        >
          Hide
        </button>
      </div>
      <ol className="space-y-3 text-gray-300">
        <li className="flex items-start">
          <span className="flex-shrink-0 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center mr-3 mt-1">1</span>
          Position your phone stable near the print (5-10cm away)
        </li>
        <li className="flex items-start">
          <span className="flex-shrink-0 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center mr-3 mt-1">2</span>
          Hold the razor blade at a 45° angle against your print
        </li>
        <li className="flex items-start">
          <span className="flex-shrink-0 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center mr-3 mt-1">3</span>
          Move at a steady speed (~1-2cm per second)
        </li>
        <li className="flex items-start">
          <span className="flex-shrink-0 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center mr-3 mt-1">4</span>
          Keep consistent pressure while dragging
        </li>
      </ol>
    </div>
  );

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/webm;codecs=vorbis',
      'audio/ogg',
      'audio/ogg;codecs=opus',
      'audio/ogg;codecs=vorbis',
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4;codecs=mp4a.40.5',
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/x-pn-wav'
    ];

    const preferredTypes = types.filter(type =>
      type.includes('webm') ||
      type.includes('opus') ||
      type.includes('wav')
    );

    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return MediaRecorder.isTypeSupported('audio/raw') ? 'audio/raw' : null;
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLock.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock not supported:', err);
    }
  };

  const startRecording = async () => {
    try {
      await requestWakeLock();
      
      const constraints = {
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      };

      const isAndroid = /Android/.test(navigator.userAgent);
      if (isAndroid) {
        constraints.audio = {
          ...constraints.audio,
          echoCancellation: true,
          noiseSuppression: true,
        };
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (initialError) {
        console.warn('Failed with custom constraints, trying defaults:', initialError);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        throw new Error('No supported audio format found');
      }

      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      recordedChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        setStatus({ 
          message: `Recording error: ${error.name}`, 
          isError: true 
        });
        stopRecording();
      };

      mediaRecorder.current.onstop = async () => {
        try {
          const audioBlob = new Blob(recordedChunks.current, { type: mimeType });
          setAudioUrl(URL.createObjectURL(audioBlob));
          await analyzeAudio(audioBlob);
        } catch (error) {
          setStatus({ 
            message: `Error processing recording: ${error.message}`, 
            isError: true 
          });
        }
      };

      mediaRecorder.current.start(1000);
      setIsRecording(true);
      setStatus({ message: 'Recording in progress...', isError: false });
      setRecordingTime(0);
      
      timerInterval.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);

      if (navigator.vibrate) navigator.vibrate(200);

    } catch (err) {
      setStatus({ 
        message: `Recording failed: ${err.message}`, 
        isError: true 
      });
      console.error('Recording setup error:', err);
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorder.current) return;

    try {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      clearInterval(timerInterval.current);
      
      if (wakeLock.current) {
        await wakeLock.current.release();
        wakeLock.current = null;
      }
      
      setIsRecording(false);
      setStatus({ message: 'Processing audio...', isError: false });
      
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } catch (err) {
      setStatus({ 
        message: `Error stopping recording: ${err.message}`, 
        isError: true 
      });
      console.error('Stop recording error:', err);
    }
  };

  const analyzeAudio = async (audioBlob) => {
    try {
      setStatus({ message: 'Analyzing audio...', isError: false });

      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.current.decodeAudioData(arrayBuffer);
      const samples = audioBuffer.getChannelData(0);
      
      const clickData = detectClicks(samples, audioBuffer.sampleRate);
      setAudioData(clickData.waveformData);
      
      setAnalysis({
        layerCount: clickData.clicks.length,
        confidence: clickData.confidence,
        accuracy: expectedLayers ?
          Math.abs(clickData.clicks.length - parseInt(expectedLayers)) / parseInt(expectedLayers) :
          null
      });

      setStatus({ message: 'Analysis complete', isError: false });
    } catch (err) {
      setStatus({ 
        message: `Analysis failed: ${err.message}`, 
        isError: true 
      });
      console.error('Audio analysis error:', err);
    }
  };

  const detectClicks = (samples, sampleRate) => {
    const windowSize = Math.floor(sampleRate * 0.005);
    const minDistance = Math.floor(sampleRate * 0.08);
    const envelope = new Float32Array(Math.floor(samples.length / windowSize));
    const waveformData = [];
    const clicks = [];
    
    const denoisedSamples = new Float32Array(samples.length);
    const noiseThreshold = 0.01;
    for (let i = 0; i < samples.length; i++) {
      denoisedSamples[i] = Math.abs(samples[i]) < noiseThreshold ? 0 : samples[i];
    }

    for (let i = 0; i < envelope.length; i++) {
      let sumSquares = 0;
      let validSamples = 0;
      for (let j = 0; j < windowSize; j++) {
        const idx = i * windowSize + j;
        if (idx < denoisedSamples.length) {
          sumSquares += denoisedSamples[idx] * denoisedSamples[idx];
          validSamples++;
        }
      }
      envelope[i] = Math.sqrt(sumSquares / validSamples);

      if (i % 5 === 0) {
        waveformData.push({
          time: i * windowSize / sampleRate,
          amplitude: envelope[i]
        });
      }
    }

    const calculateDynamicThreshold = (startIdx, endIdx) => {
      const segment = envelope.slice(startIdx, endIdx);
      const sorted = Float32Array.from(segment).sort();
      const percentile95 = sorted[Math.floor(sorted.length * 0.95)];
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      return Math.max(percentile95 * 1.5, mean * 3);
    };

    const windowWidth = Math.floor(envelope.length / 10);
    let lastClick = -minDistance;
    let consecutiveWeakClicks = 0;
    const maxConsecutiveWeakClicks = 3;

    const findPeakWidth = (envelope, peakIndex) => {
      let leftWidth = 0;
      let rightWidth = 0;
      const halfHeight = envelope[peakIndex] / 2;

      for (let i = peakIndex; i >= 0 && envelope[i] > halfHeight; i--) leftWidth++;
      for (let i = peakIndex; i < envelope.length && envelope[i] > halfHeight; i++) rightWidth++;

      return leftWidth + rightWidth;
    };

    const calculatePeakSymmetry = (envelope, peakIndex, width) => {
      const halfWidth = Math.floor(width / 2);
      let leftSum = 0;
      let rightSum = 0;
      const range = Math.min(halfWidth, 5);

      for (let i = 1; i <= range; i++) {
        if (peakIndex - i >= 0) leftSum += envelope[peakIndex - i];
        if (peakIndex + i < envelope.length) rightSum += envelope[peakIndex + i];
      }

      const maxSum = Math.max(leftSum, rightSum);
      const minSum = Math.min(leftSum, rightSum);
      return maxSum === 0 ? 0 : minSum / maxSum;
    };

    for (let i = 1; i < envelope.length - 1; i++) {
      const startIdx = Math.max(0, i - windowWidth / 2);
      const endIdx = Math.min(envelope.length, i + windowWidth / 2);
      const threshold = calculateDynamicThreshold(startIdx, endIdx);

      const isPeak = envelope[i] > envelope[i-1] && envelope[i] > envelope[i+1];
      const isSignificant = envelope[i] > threshold;
      const timeSinceLastClick = i - lastClick;

      if (isPeak && isSignificant && timeSinceLastClick >= minDistance) {
        const peakWidth = findPeakWidth(envelope, i);
        const peakSymmetry = calculatePeakSymmetry(envelope, i, peakWidth);
        
        if (peakWidth <= Math.floor(sampleRate * 0.02) && peakSymmetry > 0.7) {
          clicks.push(i * windowSize / sampleRate);
          lastClick = i;
          consecutiveWeakClicks = 0;
        } else {
          consecutiveWeakClicks++;
          if (consecutiveWeakClicks <= maxConsecutiveWeakClicks) {
            clicks.push(i * windowSize / sampleRate);
            lastClick = i;
          }
        }
      }
    }

    const clickAmplitudes = clicks.map(time => {
      const index = Math.floor(time * sampleRate / windowSize);
      return envelope[index];
    });

    const mean = clickAmplitudes.reduce((a, b) => a + b, 0) / clickAmplitudes.length;
    const variance = clickAmplitudes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / clickAmplitudes.length;
    
    const calculateTimingRegularity = (clickTimes) => {
      if (clickTimes.length < 2) return 1;
      
      const intervals = [];
      for (let i = 1; i < clickTimes.length; i++) {
        intervals.push(clickTimes[i] - clickTimes[i-1]);
      }
      
      const intervalMean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const intervalVariance = intervals.reduce((a, b) => a + Math.pow(b - intervalMean, 2), 0) / intervals.length;
      
      return Math.max(0, 1 - Math.sqrt(intervalVariance) / intervalMean);
    };

    const amplitudeConsistency = Math.max(0, 1 - Math.sqrt(variance) / mean);
    const timingRegularity = calculateTimingRegularity(clicks);
    const confidence = (amplitudeConsistency * 0.6 + timingRegularity * 0.4);

    return { clicks, confidence, waveformData };
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const saveResults = () => {
    if (!analysis) return;

    const results = {
      date: new Date().toISOString(),
      layerCount: analysis.layerCount,
      confidence: analysis.confidence,
      expectedLayers: expectedLayers ? parseInt(expectedLayers) : null,
      accuracy: analysis.accuracy
    };

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `layer-analysis-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const PermissionWarning = () => (
    <div className="bg-yellow-900 border-l-4 border-yellow-500 p-4 mb-6">
      <div className="flex items-center">
        <AlertCircle className="text-yellow-500 mr-2" size={20} />
        <p className="text-yellow-200">
          Microphone access is required. Please grant permission when prompted.
        </p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">3D Print Layer Counter</h1>
        <p className="text-gray-400">Count layers using razor blade clicks</p>
      </header>

      {!permissionGranted && !isRecording && <PermissionWarning />}
      {showGuide && !isRecording && !audioUrl && <Guide />}

      <div className="space-y-6">
        {!isRecording && !audioUrl && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Expected Layer Count (optional):
              <input
                type="number"
                value={expectedLayers}
                onChange={(e) => setExpectedLayers(e.target.value)}
                className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm p-2.5 text-white"
                placeholder="From your slicer"
                min="1"
                max="1000"
              />
            </label>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="text-center mb-6">
            <div className={`text-lg ${status.isError ? 'text-red-400' : 'text-gray-300'}`}>
              {status.message}
            </div>
            {isRecording && (
              <div className="text-3xl font-bold text-green-500 mt-2">
                {formatTime(recordingTime)}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={!!audioUrl}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Mic className="mr-2" /> Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg flex items-center justify-center"
              >
                <Square className="mr-2" /> Stop Recording
              </button>
            )}
          </div>
        </div>

        {audioUrl && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <audio
              src={audioUrl}
              controls
              className="w-full mb-4 rounded"
            />
            <button
              onClick={() => {
                setAudioUrl(null);
                setAnalysis(null);
                setAudioData(null);
              }}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg flex items-center justify-center"
            >
              <RotateCcw className="mr-2" /> Record Again
            </button>
          </div>
        )}

        {analysis && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div className="text-center mb-6">
              <div className="text-4xl font-bold text-green-500 mb-2">
                {analysis.layerCount} layers
              </div>
              <div className="flex justify-center space-x-4 text-sm text-gray-400">
                <div className="flex items-center">
                  <Award className="text-yellow-500 mr-1" size={16} />
                  Confidence: {(analysis.confidence * 100).toFixed(1)}%
                </div>
                {analysis.accuracy !== null && (
                  <div>
                    Match with expected: {((1 - analysis.accuracy) * 100).toFixed(1)}%
                  </div>
                )}
              </div>

              <button
                onClick={saveResults}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg flex items-center justify-center mt-4"
              >
                <Save className="mr-2" size={18} />
                Save Results
              </button>
            </div>

            {audioData && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Waveform Analysis</h3>
                <div className="h-64 w-full bg-gray-900 rounded-lg p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={audioData}>
                      <XAxis
                        dataKey="time"
                        stroke="#9CA3AF"
                        label={{
                          value: 'Time (seconds)',
                          position: 'bottom',
                          fill: '#9CA3AF'
                        }}
                      />
                      <YAxis
                        stroke="#9CA3AF"
                        label={{
                          value: 'Amplitude',
                          angle: -90,
                          position: 'left',
                          fill: '#9CA3AF'
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: 'none',
                          borderRadius: '0.5rem',
                          color: '#F3F4F6'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="amplitude"
                        stroke="#60A5FA"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        <footer className="text-center text-gray-500 text-sm mt-8">
          <p>© 2024 3D Print Layer Counter</p>
        </footer>
      </div>
    </div>
  );
};

export default App;