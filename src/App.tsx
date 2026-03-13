import React, { useState, useCallback, useRef, useMemo } from 'react';
import { removeBackground } from '@imgly/background-removal';
import { Upload, Download, X, Loader2, Image as ImageIcon, CheckCircle2, RefreshCw, Sun, Moon, Grid3X3, Sparkles, Palette, ZoomIn, ZoomOut, Maximize, Scissors, Zap, Eraser, ShieldAlert, Type, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Undo, Redo, RotateCcw } from 'lucide-react';
import ImageTracer from 'imagetracerjs';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [rawImageData, setRawImageData] = useState<ImageData | null>(null);
  const [intensity, setIntensity] = useState(30);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [opacity, setOpacity] = useState(100);
  const [bwContrast, setBwContrast] = useState(0);
  const [fade, setFade] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [smoothing, setSmoothing] = useState(0);
  const [denoise, setDenoise] = useState(0);
  const [colorUnify, setColorUnify] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [tint, setTint] = useState(0);
  const [activeChannel, setActiveChannel] = useState<'rgb' | 'red' | 'green' | 'blue'>('rgb');
  const [curves, setCurves] = useState<Record<string, {x: number, y: number}[]>>({
    rgb: [{x: 0, y: 0}, {x: 255, y: 255}],
    red: [{x: 0, y: 0}, {x: 255, y: 255}],
    green: [{x: 0, y: 0}, {x: 255, y: 255}],
    blue: [{x: 0, y: 0}, {x: 255, y: 255}],
  });
  const [blackPoint, setBlackPoint] = useState<Record<string, number>>({ rgb: 0, red: 0, green: 0, blue: 0 });
  const [whitePoint, setWhitePoint] = useState<Record<string, number>>({ rgb: 255, red: 255, green: 255, blue: 255 });
  const [histogram, setHistogram] = useState<number[]>(new Array(256).fill(0));
  const [zoom, setZoom] = useState(1);
  const [previewBg, setPreviewBg] = useState<'checkerboard' | 'black' | 'white'>('checkerboard');
  const processedUrlRef = useRef<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [removeBgEnabled, setRemoveBgEnabled] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // History State
  const [history, setHistory] = useState<{
    intensity: number;
    contrast: number;
    saturation: number;
    opacity: number;
    bwContrast: number;
    fade: number;
    sharpness: number;
    smoothing: number;
    denoise: number;
    colorUnify: number;
    temperature: number;
    tint: number;
    curves: Record<string, {x: number, y: number}[]>;
    blackPoint: Record<string, number>;
    whitePoint: Record<string, number>;
    removeBgEnabled: boolean;
    rawImageData: ImageData | null;
  }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isInternalUpdate = useRef(false);

  const pushToHistory = useCallback((state: any) => {
    if (isInternalUpdate.current) return;
    
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      // Only push if something actually changed
      const lastState = newHistory[newHistory.length - 1];
      if (lastState) {
        const hasChanged = 
          lastState.intensity !== state.intensity ||
          lastState.contrast !== state.contrast ||
          lastState.saturation !== state.saturation ||
          lastState.opacity !== state.opacity ||
          lastState.bwContrast !== state.bwContrast ||
          lastState.fade !== state.fade ||
          lastState.sharpness !== state.sharpness ||
          lastState.smoothing !== state.smoothing ||
          lastState.denoise !== state.denoise ||
          lastState.colorUnify !== state.colorUnify ||
          lastState.temperature !== state.temperature ||
          lastState.tint !== state.tint ||
          lastState.removeBgEnabled !== state.removeBgEnabled ||
          JSON.stringify(lastState.curves) !== JSON.stringify(state.curves) ||
          JSON.stringify(lastState.blackPoint) !== JSON.stringify(state.blackPoint) ||
          JSON.stringify(lastState.whitePoint) !== JSON.stringify(state.whitePoint) ||
          lastState.rawImageData !== state.rawImageData;
        
        if (!hasChanged) return prev;
      }
      
      const updatedHistory = [...newHistory, state];
      // Limit history to 50 steps
      if (updatedHistory.length > 50) {
        return updatedHistory.slice(1);
      }
      return updatedHistory;
    });
    setHistoryIndex(prev => {
      const next = prev + 1;
      return next > 49 ? 49 : next;
    });
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const state = history[prevIndex];
      applyHistoryState(state, prevIndex);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const state = history[nextIndex];
      applyHistoryState(state, nextIndex);
    }
  };

  const resetToOriginal = () => {
    if (history.length > 0 && historyIndex !== 0) {
      applyHistoryState(history[0], 0);
    }
  };

  const applyHistoryState = (state: any, index: number) => {
    isInternalUpdate.current = true;
    setIntensity(state.intensity);
    setContrast(state.contrast);
    setSaturation(state.saturation);
    setOpacity(state.opacity);
    setBwContrast(state.bwContrast);
    setFade(state.fade);
    setSharpness(state.sharpness);
    setSmoothing(state.smoothing);
    setDenoise(state.denoise);
    setColorUnify(state.colorUnify);
    setTemperature(state.temperature);
    setTint(state.tint);
    setCurves(state.curves);
    setBlackPoint(state.blackPoint);
    setWhitePoint(state.whitePoint);
    setRemoveBgEnabled(state.removeBgEnabled);
    setRawImageData(state.rawImageData);
    
    if (state.rawImageData) {
      const newUrl = applyAdjustments(state.rawImageData, {
        intensity: state.intensity,
        contrast: state.contrast,
        saturation: state.saturation,
        opacity: state.opacity,
        bwContrast: state.bwContrast,
        fade: state.fade,
        sharpness: state.sharpness,
        smoothing: state.smoothing,
        denoise: state.denoise,
        colorUnify: state.colorUnify,
        temperature: state.temperature,
        tint: state.tint,
        curves: state.curves,
        blackPoint: state.blackPoint,
        whitePoint: state.whitePoint
      });
      setProcessedImage(newUrl);
      processedUrlRef.current = newUrl;
      setHistogram(calculateHistogram(state.rawImageData));
    }
    
    setHistoryIndex(index);
    setTimeout(() => {
      isInternalUpdate.current = false;
    }, 0);
  };

  const getCurrentState = useCallback(() => {
    return {
      intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint, curves, blackPoint, whitePoint, removeBgEnabled, rawImageData
    };
  }, [intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint, curves, blackPoint, whitePoint, removeBgEnabled, rawImageData]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wbQuadrantRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    return () => {
      if (processedUrlRef.current) {
        URL.revokeObjectURL(processedUrlRef.current);
      }
    };
  }, []);

  const calculateHistogram = (imageData: ImageData) => {
    const hist = new Array(256).fill(0);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      hist[gray]++;
    }
    // Normalize
    const max = Math.max(...hist);
    return hist.map(v => v / max);
  };

  const processImage = async (file: File) => {
    setCurrentFile(file);
    const isAvif = file.name.toLowerCase().endsWith('.avif') || file.type === 'image/avif';
    
    if (!file.type.startsWith('image/') && !isAvif) {
      setError('請上傳有效的圖片檔案');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProcessedImage(null);

    // Create a preview of the original image
    const reader = new FileReader();
    reader.onload = (e) => setOriginalImage(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      if (processedUrlRef.current) {
        URL.revokeObjectURL(processedUrlRef.current);
      }

      let fileToProcess: File | Blob = file;

      // AVIF compatibility layer
      if (isAvif) {
        try {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.src = url;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('無法載入 AVIF 檔案'));
          });
          
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          
          const pngBlob = await new Promise<Blob | null>((resolve) => 
            canvas.toBlob((b) => resolve(b), 'image/png')
          );
          
          if (pngBlob) {
            fileToProcess = pngBlob;
          }
          URL.revokeObjectURL(url);
        } catch (convErr) {
          console.warn('AVIF conversion failed, attempting direct processing:', convErr);
        }
      }

      let finalBlob: Blob | File = fileToProcess;

      if (removeBgEnabled) {
        finalBlob = await removeBackground(fileToProcess, {
          progress: (status, progress) => {
            console.log(`Processing: ${status} (${Math.round(progress * 100)}%)`);
          },
        });
      }

      // Convert blob to ImageData
      const img = new Image();
      const blobUrl = URL.createObjectURL(finalBlob);
      img.src = blobUrl;
      await new Promise((resolve) => (img.onload = resolve));
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      setRawImageData(imageData);
      setHistogram(calculateHistogram(imageData));
      URL.revokeObjectURL(blobUrl);
      
      const currentState = {
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint, curves, blackPoint, whitePoint, removeBgEnabled, rawImageData: imageData
      };
      pushToHistory(currentState);

      // Apply initial adjustments
      const processedUrl = applyAdjustments(imageData, {
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint
      });
      processedUrlRef.current = processedUrl;
      setProcessedImage(processedUrl);
    } catch (err) {
      console.error('Processing failed:', err);
      setError('圖片處理失敗，請稍後再試。');
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-process image when background removal toggle changes
  React.useEffect(() => {
    if (currentFile) {
      processImage(currentFile);
    }
  }, [removeBgEnabled]);

  const getCurveLUT = (points: {x: number, y: number}[], blackPoint: number = 0, whitePoint: number = 255) => {
    const lut = new Uint8ClampedArray(256);
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    
    for (let i = 0; i < 256; i++) {
      // 1. Apply Black/White Point mapping (Input mapping)
      let input = i;
      if (input <= blackPoint) input = 0;
      else if (input >= whitePoint) input = 255;
      else {
        input = ((input - blackPoint) / (whitePoint - blackPoint)) * 255;
      }

      // 2. Apply Curve interpolation
      let p1 = sortedPoints[0];
      let p2 = sortedPoints[sortedPoints.length - 1];
      
      if (input <= p1.x) {
        lut[i] = p1.y;
        continue;
      }
      if (input >= p2.x) {
        lut[i] = p2.y;
        continue;
      }

      for (let j = 0; j < sortedPoints.length - 1; j++) {
        if (input >= sortedPoints[j].x && input <= sortedPoints[j+1].x) {
          p1 = sortedPoints[j];
          p2 = sortedPoints[j+1];
          break;
        }
      }
      
      const t = (input - p1.x) / (p2.x - p1.x);
      lut[i] = Math.round(p1.y + t * (p2.y - p1.y));
    }
    return lut;
  };

  const applyAdjustments = (
    imageData: ImageData,
    params: {
      intensity: number;
      contrast: number;
      saturation: number;
      opacity: number;
      bwContrast: number;
      fade: number;
      sharpness: number;
      smoothing: number;
      denoise: number;
      colorUnify: number;
      temperature: number;
      tint: number;
      curves?: Record<string, {x: number, y: number}[]>;
      blackPoint?: Record<string, number>;
      whitePoint?: Record<string, number>;
    }
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    
    let workingData = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );

    const { 
      intensity, contrast, saturation, opacity, bwContrast, 
      fade, sharpness, smoothing, denoise, colorUnify, 
      temperature, tint, curves: curvePoints,
      blackPoint: blackPoints, whitePoint: whitePoints
    } = params;
    
    const luts = curvePoints ? {
      rgb: getCurveLUT(curvePoints.rgb, blackPoints?.rgb ?? 0, whitePoints?.rgb ?? 255),
      red: getCurveLUT(curvePoints.red, blackPoints?.red ?? 0, whitePoints?.red ?? 255),
      green: getCurveLUT(curvePoints.green, blackPoints?.green ?? 0, whitePoints?.green ?? 255),
      blue: getCurveLUT(curvePoints.blue, blackPoints?.blue ?? 0, whitePoints?.blue ?? 255),
    } : null;
    
    // 0. Color Unification (Enhanced Quantization + Spatial Smoothing)
    if (colorUnify > 0) {
      const src = workingData.data;
      const sw = workingData.width;
      const sh = workingData.height;
      const output = new Uint8ClampedArray(src.length);
      
      // Aggressive quantization step
      const step = 1 + (colorUnify / 2); 
      
      // Spatial smoothing radius based on intensity
      const radius = Math.floor(colorUnify / 40); 

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const idx = (y * sw + x) * 4;
          if (src[idx + 3] === 0) continue;

          let r = src[idx];
          let g = src[idx + 1];
          let b = src[idx + 2];

          // Spatial component: average nearby colors that are similar
          if (radius > 0) {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            const threshold = 30 + (colorUnify / 2);

            for (let ky = -radius; ky <= radius; ky++) {
              for (let kx = -radius; kx <= radius; kx++) {
                const py = y + ky;
                const px = x + kx;
                if (py >= 0 && py < sh && px >= 0 && px < sw) {
                  const nIdx = (py * sw + px) * 4;
                  const nr = src[nIdx];
                  const ng = src[nIdx + 1];
                  const nb = src[nIdx + 2];
                  
                  const dist = Math.sqrt((r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2);
                  if (dist < threshold) {
                    rSum += nr;
                    gSum += ng;
                    bSum += nb;
                    count++;
                  }
                }
              }
            }
            r = rSum / count;
            g = gSum / count;
            b = bSum / count;
          }

          // Quantization component
          output[idx] = Math.min(255, Math.round(r / step) * step);
          output[idx + 1] = Math.min(255, Math.round(g / step) * step);
          output[idx + 2] = Math.min(255, Math.round(b / step) * step);
          output[idx + 3] = src[idx + 3];
        }
      }
      workingData = new ImageData(output, sw, sh);
    }

    // 0.5. Denoise (Selective Blur / Surface Blur)
    if (denoise > 0) {
      const src = workingData.data;
      const sw = workingData.width;
      const sh = workingData.height;
      const output = new Uint8ClampedArray(src.length);
      const threshold = (denoise / 100) * 50; // Color distance threshold
      const radius = Math.ceil((denoise / 100) * 2);

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const idx = (y * sw + x) * 4;
          const r1 = src[idx];
          const g1 = src[idx + 1];
          const b1 = src[idx + 2];
          const a1 = src[idx + 3];

          if (a1 === 0) {
            output[idx] = r1;
            output[idx + 1] = g1;
            output[idx + 2] = b1;
            output[idx + 3] = a1;
            continue;
          }

          let rSum = 0, gSum = 0, bSum = 0, count = 0;

          for (let ky = -radius; ky <= radius; ky++) {
            for (let kx = -radius; kx <= radius; kx++) {
              const py = y + ky;
              const px = x + kx;
              if (py >= 0 && py < sh && px >= 0 && px < sw) {
                const nIdx = (py * sw + px) * 4;
                const r2 = src[nIdx];
                const g2 = src[nIdx + 1];
                const b2 = src[nIdx + 2];
                
                // Color distance check
                const dist = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
                if (dist < threshold) {
                  rSum += r2;
                  gSum += g2;
                  bSum += b2;
                  count++;
                }
              }
            }
          }

          output[idx] = rSum / count;
          output[idx + 1] = gSum / count;
          output[idx + 2] = bSum / count;
          output[idx + 3] = a1;
        }
      }
      workingData = new ImageData(output, sw, sh);
    }

    // 0.7. White Balance (Temperature & Tint)
    if (temperature !== 0 || tint !== 0) {
      const src = workingData.data;
      for (let i = 0; i < src.length; i += 4) {
        if (src[i + 3] === 0) continue;
        
        let r = src[i];
        let g = src[i + 1];
        let b = src[i + 2];
        
        // Temperature: -100 (Cool/Blue) to 100 (Warm/Yellow)
        // Warm: Increase Red/Green slightly, decrease Blue
        // Cool: Decrease Red/Green slightly, increase Blue
        if (temperature !== 0) {
          r += temperature * 0.4;
          g += temperature * 0.1;
          b -= temperature * 0.4;
        }
        
        // Tint: -100 (Green) to 100 (Magenta)
        // Magenta: Increase Red/Blue, decrease Green
        // Green: Decrease Red/Blue, increase Green
        if (tint !== 0) {
          r += tint * 0.2;
          g -= tint * 0.4;
          b += tint * 0.2;
        }
        
        src[i] = Math.max(0, Math.min(255, r));
        src[i + 1] = Math.max(0, Math.min(255, g));
        src[i + 2] = Math.max(0, Math.min(255, b));
      }
    }

    // 1. Sharpness (Convolution)
    if (sharpness > 0) {
      const amount = sharpness / 100;
      const kernel = [
        0, -amount, 0,
        -amount, 1 + 4 * amount, -amount,
        0, -amount, 0
      ];
      const side = Math.round(Math.sqrt(kernel.length));
      const halfSide = Math.floor(side / 2);
      const src = workingData.data;
      const sw = workingData.width;
      const sh = workingData.height;
      const output = new Uint8ClampedArray(src.length);

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const dstOff = (y * sw + x) * 4;
          let r = 0, g = 0, b = 0;
          for (let cy = 0; cy < side; cy++) {
            for (let cx = 0; cx < side; cx++) {
              const scy = Math.min(sh - 1, Math.max(0, y + cy - halfSide));
              const scx = Math.min(sw - 1, Math.max(0, x + cx - halfSide));
              const srcOff = (scy * sw + scx) * 4;
              const wt = kernel[cy * side + cx];
              r += src[srcOff] * wt;
              g += src[srcOff + 1] * wt;
              b += src[srcOff + 2] * wt;
            }
          }
          output[dstOff] = r;
          output[dstOff + 1] = g;
          output[dstOff + 2] = b;
          output[dstOff + 3] = src[dstOff + 3];
        }
      }
      workingData = new ImageData(output, sw, sh);
    }

    const cFactor = contrast / 100;
    const sFactor = saturation / 100;
    const oFactor = opacity / 100;
    const bwFactor = bwContrast / 100;
    const fFactor = fade / 100;

    for (let i = 0; i < workingData.data.length; i += 4) {
      let r = workingData.data[i];
      let g = workingData.data[i + 1];
      let b = workingData.data[i + 2];
      let a = workingData.data[i + 3];

      // 2. Background Removal Intensity (Alpha Thresholding)
      if (intensity > 0) {
        const brightness = (r + g + b) / 3;
        // More sophisticated white factor: aggressively targets bright pixels that are likely halos
        const whiteFactor = brightness > 245 ? 2.2 : (brightness > 220 ? 1.8 : (brightness > 180 ? 1.4 : (brightness > 140 ? 1.1 : 1.0)));
        if (a < intensity * whiteFactor) {
          a = 0;
        }
      }

      // 3. Opacity
      a = a * oFactor;

      if (a > 0) {
        // 4. Fade
        if (fFactor > 0) {
          r = r + (255 - r) * fFactor;
          g = g + (255 - g) * fFactor;
          b = b + (255 - b) * fFactor;
        }

        // 5. Contrast
        r = Math.min(255, Math.max(0, (r - 128) * cFactor + 128));
        g = Math.min(255, Math.max(0, (g - 128) * cFactor + 128));
        b = Math.min(255, Math.max(0, (b - 128) * cFactor + 128));

        // 6. B&W Contrast
        if (bwFactor > 0) {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = r * (1 - bwFactor) + gray * bwFactor;
          g = g * (1 - bwFactor) + gray * bwFactor;
          b = b * (1 - bwFactor) + gray * bwFactor;
        }

        // 7. Saturation
        if (sFactor !== 1) {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = Math.min(255, Math.max(0, gray + (r - gray) * sFactor));
          g = Math.min(255, Math.max(0, gray + (g - gray) * sFactor));
          b = Math.min(255, Math.max(0, gray + (b - gray) * sFactor));
        }

        // 7.5 Curves
        if (luts) {
          // Apply per-channel curves
          r = luts.red[Math.round(r)];
          g = luts.green[Math.round(g)];
          b = luts.blue[Math.round(b)];
          
          // Apply master RGB curve
          r = luts.rgb[Math.round(r)];
          g = luts.rgb[Math.round(g)];
          b = luts.rgb[Math.round(b)];
        }
      }

      workingData.data[i] = r;
      workingData.data[i + 1] = g;
      workingData.data[i + 2] = b;
      workingData.data[i + 3] = a;
    }

    // 8. Edge Smoothing (Alpha-only smoothing to prevent color blur)
    if (smoothing > 0) {
      const src = workingData.data;
      const sw = workingData.width;
      const sh = workingData.height;
      const outputAlpha = new Uint8ClampedArray(sw * sh);
      const smoothFactor = (smoothing / 100) * 2; // Radius

      // Simple box blur for alpha channel
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          let sum = 0;
          let count = 0;
          const range = Math.ceil(smoothFactor);
          
          for (let ky = -range; ky <= range; ky++) {
            for (let kx = -range; kx <= range; kx++) {
              const py = y + ky;
              const px = x + kx;
              if (py >= 0 && py < sh && px >= 0 && px < sw) {
                sum += src[(py * sw + px) * 4 + 3];
                count++;
              }
            }
          }
          
          let blurredAlpha = sum / count;
          
          // Alpha Contrast/Hardening: 
          // This keeps the edge smooth but "sharp" in terms of transition
          // We boost the contrast of the blurred alpha
          const contrastBoost = 1 + (smoothing / 50); 
          blurredAlpha = (blurredAlpha - 128) * contrastBoost + 128;
          outputAlpha[y * sw + x] = Math.min(255, Math.max(0, blurredAlpha));
        }
      }

      // Apply smoothed alpha back to workingData
      for (let i = 0; i < sw * sh; i++) {
        workingData.data[i * 4 + 3] = outputAlpha[i];
      }
    }

    ctx.putImageData(workingData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  const handleAdjustmentChange = (type: string | Record<string, any>, value?: any) => {
    let newIntensity = intensity;
    let newContrast = contrast;
    let newSaturation = saturation;
    let newOpacity = opacity;
    let newBwContrast = bwContrast;
    let newFade = fade;
    let newSharpness = sharpness;
    let newSmoothing = smoothing;
    let newDenoise = denoise;
    let newColorUnify = colorUnify;
    let newTemperature = temperature;
    let newTint = tint;
    let newCurves = curves;
    let newBlackPoint = blackPoint;
    let newWhitePoint = whitePoint;

    const updates = typeof type === 'string' ? { [type]: value } : type;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'intensity') { setIntensity(val); newIntensity = val; }
      if (key === 'contrast') { setContrast(val); newContrast = val; }
      if (key === 'saturation') { setSaturation(val); newSaturation = val; }
      if (key === 'opacity') { setOpacity(val); newOpacity = val; }
      if (key === 'bwContrast') { setBwContrast(val); newBwContrast = val; }
      if (key === 'fade') { setFade(val); newFade = val; }
      if (key === 'sharpness') { setSharpness(val); newSharpness = val; }
      if (key === 'smoothing') { setSmoothing(val); newSmoothing = val; }
      if (key === 'denoise') { setDenoise(val); newDenoise = val; }
      if (key === 'colorUnify') { setColorUnify(val); newColorUnify = val; }
      if (key === 'temperature') { setTemperature(val); newTemperature = val; }
      if (key === 'tint') { setTint(val); newTint = val; }
      if (key === 'curves') { setCurves(val); newCurves = val; }
      if (key === 'blackPoint') { setBlackPoint(val); newBlackPoint = val; }
      if (key === 'whitePoint') { setWhitePoint(val); newWhitePoint = val; }
    }

    if (rawImageData) {
      const newUrl = applyAdjustments(rawImageData, {
        intensity: newIntensity,
        contrast: newContrast,
        saturation: newSaturation,
        opacity: newOpacity,
        bwContrast: newBwContrast,
        fade: newFade,
        sharpness: newSharpness,
        smoothing: newSmoothing,
        denoise: newDenoise,
        colorUnify: newColorUnify,
        temperature: newTemperature,
        tint: newTint,
        curves: newCurves,
        blackPoint: newBlackPoint,
        whitePoint: newWhitePoint
      });
      setProcessedImage(newUrl);
      processedUrlRef.current = newUrl;
      
      // Push to history after adjustment
      pushToHistory({
        intensity: newIntensity,
        contrast: newContrast,
        saturation: newSaturation,
        opacity: newOpacity,
        bwContrast: newBwContrast,
        fade: newFade,
        sharpness: newSharpness,
        smoothing: newSmoothing,
        denoise: newDenoise,
        colorUnify: newColorUnify,
        temperature: newTemperature,
        tint: newTint,
        curves: newCurves,
        blackPoint: newBlackPoint,
        whitePoint: newWhitePoint,
        removeBgEnabled,
        rawImageData
      });
    }
  };

  const handleAntiAlias = () => {
    // A high-quality preset for anti-aliasing
    // Smoothing 45% is usually a sweet spot for removing jaggies without over-blurring
    handleAdjustmentChange({ smoothing: 45, sharpness: 15 });
  };

  const handleRemoveWhiteEdges = () => {
    // Increase intensity to cut deeper into bright edges
    // 85 is roughly 33%, which is effective for most halos
    handleAdjustmentChange({ intensity: 85, smoothing: 35 });
  };

  const handleStrongRemoveWhiteEdges = () => {
    // Optimized combination for "Strong" removal:
    // 1. High intensity to cut deep into bright halos
    // 2. Moderate smoothing to blend the edge
    // 3. High sharpness to keep the newly cut edge crisp and professional
    // 4. Slight contrast boost to make the object pop against the new edge
    handleAdjustmentChange({ 
      intensity: 135, 
      smoothing: 40, 
      sharpness: 45, 
      contrast: 108 
    });
  };

  const handleRemoveWatermark = async () => {
    if (!rawImageData || !processedImage) return;
    
    setIsProcessing(true);
    // Small delay to show the loading state
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const canvas = document.createElement('canvas');
      canvas.width = rawImageData.width;
      canvas.height = rawImageData.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(rawImageData, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;

      // 1. Detect Watermark Areas (High-frequency, semi-transparent, often neutral color)
      // We'll create a mask for potential watermark pixels
      const mask = new Uint8Array(width * height);
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a === 0) continue;

        // Watermarks are often:
        // - Semi-transparent (alpha < 255)
        // - Or have specific color characteristics (neutral/grayish)
        // - Or have high local contrast (text edges)
        
        const brightness = (r + g + b) / 3;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        
        // Basic heuristic: semi-transparent pixels with low saturation
        if (a < 230 && saturation < 30) {
          mask[i / 4] = 1;
        }
      }

      // 2. Simple Inpainting (Median-based filling for masked areas)
      const outputData = new Uint8ClampedArray(data);
      const radius = 2;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (mask[idx] === 1) {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            
            for (let ky = -radius; ky <= radius; ky++) {
              for (let kx = -radius; kx <= radius; kx++) {
                const py = y + ky;
                const px = x + kx;
                if (py >= 0 && py < height && px >= 0 && px < width) {
                  const nIdx = py * width + px;
                  if (mask[nIdx] === 0) { // Only use non-watermark pixels for filling
                    rSum += data[nIdx * 4];
                    gSum += data[nIdx * 4 + 1];
                    bSum += data[nIdx * 4 + 2];
                    count++;
                  }
                }
              }
            }

            if (count > 0) {
              outputData[idx * 4] = rSum / count;
              outputData[idx * 4 + 1] = gSum / count;
              outputData[idx * 4 + 2] = bSum / count;
              // Keep original alpha or slightly boost it to blend
              outputData[idx * 4 + 3] = data[idx * 4 + 3];
            }
          }
        }
      }

      const newImageData = new ImageData(outputData, width, height);
      setRawImageData(newImageData);
      
      // Re-apply current adjustments to the new raw data
      const adjustedUrl = applyAdjustments(newImageData, {
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint
      });

      pushToHistory({
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint, curves, blackPoint, whitePoint, removeBgEnabled, rawImageData: newImageData
      });
      
      if (processedUrlRef.current && !processedUrlRef.current.startsWith('data:')) {
        URL.revokeObjectURL(processedUrlRef.current);
      }
      processedUrlRef.current = adjustedUrl;
      setProcessedImage(adjustedUrl);
    } catch (err) {
      console.error("Watermark removal failed:", err);
      setError("浮水印去除失敗，請重試");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleForceRemoveWatermark = async () => {
    if (!rawImageData || !processedImage) return;
    
    setIsProcessing(true);
    // Longer delay to simulate heavy processing
    await new Promise(resolve => setTimeout(resolve, 1200));

    try {
      const canvas = document.createElement('canvas');
      canvas.width = rawImageData.width;
      canvas.height = rawImageData.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(rawImageData, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;

      // 1. Aggressive Detection
      const mask = new Uint8Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a === 0) continue;

        const brightness = (r + g + b) / 3;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        
        // Force mode targets:
        // - More alpha ranges
        // - Higher saturation (colored watermarks)
        // - High contrast text (very bright/dark)
        if (a < 250 && (saturation < 80 || brightness > 220 || brightness < 40)) {
          mask[i / 4] = 1;
        }
      }

      // 2. Mask Dilation (to ensure text edges are covered)
      const dilatedMask = new Uint8Array(mask.length);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          if (mask[idx] === 1) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                dilatedMask[(y + dy) * width + (x + dx)] = 1;
              }
            }
          }
        }
      }

      // 3. Deep Inpainting
      const outputData = new Uint8ClampedArray(data);
      const radius = 4; // Larger search radius

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (dilatedMask[idx] === 1) {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let ky = -radius; ky <= radius; ky++) {
              for (let kx = -radius; kx <= radius; kx++) {
                const py = y + ky;
                const px = x + kx;
                if (py >= 0 && py < height && px >= 0 && px < width) {
                  const nIdx = py * width + px;
                  if (dilatedMask[nIdx] === 0) {
                    rSum += data[nIdx * 4];
                    gSum += data[nIdx * 4 + 1];
                    bSum += data[nIdx * 4 + 2];
                    count++;
                  }
                }
              }
            }
            if (count > 0) {
              outputData[idx * 4] = rSum / count;
              outputData[idx * 4 + 1] = gSum / count;
              outputData[idx * 4 + 2] = bSum / count;
            }
          }
        }
      }

      const newImageData = new ImageData(outputData, width, height);
      setRawImageData(newImageData);
      
      const adjustedUrl = applyAdjustments(newImageData, {
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint
      });

      pushToHistory({
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint, curves, blackPoint, whitePoint, removeBgEnabled, rawImageData: newImageData
      });
      
      if (processedUrlRef.current && !processedUrlRef.current.startsWith('data:')) {
        URL.revokeObjectURL(processedUrlRef.current);
      }
      processedUrlRef.current = adjustedUrl;
      setProcessedImage(adjustedUrl);
    } catch (err) {
      console.error("Force watermark removal failed:", err);
      setError("強制浮水印去除失敗");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveText = async () => {
    if (!rawImageData || !processedImage) return;
    
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      const canvas = document.createElement('canvas');
      canvas.width = rawImageData.width;
      canvas.height = rawImageData.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(rawImageData, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;

      // 1. Enhanced Edge & Contrast Detection
      const mask = new Uint8Array(width * height);
      const sensitivity = 25; // Lower threshold for more sensitive detection
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          
          let maxDiff = 0;
          const r = data[idx], g = data[idx+1], b = data[idx+2];
          const centerBr = (r + g + b) / 3;
          
          // Check neighbors for contrast
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = ((y + dy) * width + (x + dx)) * 4;
              const nBr = (data[nIdx] + data[nIdx+1] + data[nIdx+2]) / 3;
              maxDiff = Math.max(maxDiff, Math.abs(centerBr - nBr));
            }
          }

          // Text detection: high local contrast or sharp luminance changes
          if (maxDiff > sensitivity) {
            mask[y * width + x] = 1;
          }
        }
      }

      // 2. Density Filtering: Text usually appears in clusters
      const filteredMask = new Uint8Array(mask.length);
      const checkRadius = 2;
      for (let y = checkRadius; y < height - checkRadius; y++) {
        for (let x = checkRadius; x < width - checkRadius; x++) {
          if (mask[y * width + x] === 1) {
            let neighbors = 0;
            for (let dy = -checkRadius; dy <= checkRadius; dy++) {
              for (let dx = -checkRadius; dx <= checkRadius; dx++) {
                if (mask[(y + dy) * width + (x + dx)] === 1) neighbors++;
              }
            }
            // If it's an isolated edge, it might be noise. Text has dense edges.
            if (neighbors > 3) {
              filteredMask[y * width + x] = 1;
            }
          }
        }
      }

      // 3. Aggressive Dilation: Ensure we cover the entire stroke and its anti-aliasing
      const dilatedMask = new Uint8Array(mask.length);
      const dRadius = 3; // Increased dilation
      for (let y = dRadius; y < height - dRadius; y++) {
        for (let x = dRadius; x < width - dRadius; x++) {
          if (filteredMask[y * width + x] === 1) {
            for (let dy = -dRadius; dy <= dRadius; dy++) {
              for (let dx = -dRadius; dx <= dRadius; dx++) {
                dilatedMask[(y + dy) * width + (x + dx)] = 1;
              }
            }
          }
        }
      }

      // 4. Advanced Inpainting: Larger radius and smarter blending
      const outputData = new Uint8ClampedArray(data);
      const iRadius = 8; // Larger search radius for better background sampling

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (dilatedMask[idx] === 1) {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            let weightSum = 0;
            
            for (let ky = -iRadius; ky <= iRadius; ky++) {
              for (let kx = -iRadius; kx <= iRadius; kx++) {
                const py = y + ky;
                const px = x + kx;
                if (py >= 0 && py < height && px >= 0 && px < width) {
                  const nIdx = py * width + px;
                  if (dilatedMask[nIdx] === 0) {
                    // Distance-based weighting for smoother inpainting
                    const dist = Math.sqrt(ky * ky + kx * kx);
                    const weight = 1 / (1 + dist);
                    
                    rSum += data[nIdx * 4] * weight;
                    gSum += data[nIdx * 4 + 1] * weight;
                    bSum += data[nIdx * 4 + 2] * weight;
                    weightSum += weight;
                    count++;
                  }
                }
              }
            }
            
            if (count > 0) {
              outputData[idx * 4] = rSum / weightSum;
              outputData[idx * 4 + 1] = gSum / weightSum;
              outputData[idx * 4 + 2] = bSum / weightSum;
            }
          }
        }
      }

      const newImageData = new ImageData(outputData, width, height);
      setRawImageData(newImageData);
      
      const adjustedUrl = applyAdjustments(newImageData, {
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint
      });

      pushToHistory({
        intensity, contrast, saturation, opacity, bwContrast, fade, sharpness, smoothing, denoise, colorUnify, temperature, tint, curves, blackPoint, whitePoint, removeBgEnabled, rawImageData: newImageData
      });
      
      if (processedUrlRef.current && !processedUrlRef.current.startsWith('data:')) {
        URL.revokeObjectURL(processedUrlRef.current);
      }
      processedUrlRef.current = adjustedUrl;
      setProcessedImage(adjustedUrl);
    } catch (err) {
      console.error("Text removal failed:", err);
      setError("文字清除失敗");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleColorUnifyPreset = () => {
    // A preset for color unification to reduce compression artifacts and noise
    handleAdjustmentChange({ colorUnify: 40, denoise: 30 });
  };

  const handleIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleAdjustmentChange('intensity', parseInt(e.target.value));
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImage(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processImage(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const reset = () => {
    if (processedUrlRef.current && !processedUrlRef.current.startsWith('data:')) {
      URL.revokeObjectURL(processedUrlRef.current);
    }
    processedUrlRef.current = null;
    setOriginalImage(null);
    setProcessedImage(null);
    setRawImageData(null);
    setCurrentFile(null);
    setHistory([]);
    setHistoryIndex(-1);
    setIntensity(30);
    setContrast(100);
    setSaturation(100);
    setOpacity(100);
    setBwContrast(0);
    setFade(0);
    setSharpness(0);
    setSmoothing(0);
    setRemoveBgEnabled(false);
    setDenoise(0);
    setColorUnify(0);
    setTemperature(0);
    setTint(0);
    setZoom(1);
    setError(null);
    setIsProcessing(false);
  };

  const handleWBQuadrantInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!wbQuadrantRef.current) return;
    
    const rect = wbQuadrantRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    
    // Map to -100 to 100
    // X axis: Temperature (Left: -100, Right: 100)
    // Y axis: Tint (Top: 100, Bottom: -100)
    const newTemp = Math.round(((x / rect.width) * 200) - 100);
    const newTint = Math.round(100 - ((y / rect.height) * 200));
    
    handleAdjustmentChange({ temperature: newTemp, tint: newTint });
  };

  const CurvesControl = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
    const [draggingSlider, setDraggingSlider] = useState<'black' | 'white' | null>(null);
    const [hoverPoint, setHoverPoint] = useState<number | null>(null);
    const [activePoint, setActivePoint] = useState<number | null>(null);

    // Calculate histogram path
    const histogramPath = useMemo(() => {
      if (!histogram || histogram.length === 0) return "";
      let path = "M 0 100";
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 100;
        const y = 100 - (histogram[i] * 80); // Max height 80%
        path += ` L ${x} ${y}`;
      }
      path += " L 100 100 Z";
      return path;
    }, [histogram]);

    const handleCurveMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      
      const x = Math.max(0, Math.min(255, Math.round(((clientX - rect.left) / rect.width) * 255)));
      const y = Math.max(0, Math.min(255, Math.round(255 - ((clientY - rect.top) / rect.height) * 255)));

      const currentCurves = curves[activeChannel];

      // Check if clicking near an existing point (increased hit area for fallback)
      const existingIndex = currentCurves.findIndex(p => Math.abs(p.x - x) < 12 && Math.abs(p.y - y) < 12);
      
      if (existingIndex !== -1) {
        setDraggingPointIndex(existingIndex);
        setActivePoint(existingIndex);
      } else {
        // Add new point
        const newPoints = [...currentCurves, { x, y }].sort((a, b) => a.x - b.x);
        handleAdjustmentChange('curves', { ...curves, [activeChannel]: newPoints });
        const newIdx = newPoints.findIndex(p => p.x === x && p.y === y);
        setDraggingPointIndex(newIdx);
        setActivePoint(newIdx);
      }
    };

    const handleSliderMouseDown = (e: React.MouseEvent | React.TouchEvent, type: 'black' | 'white') => {
      e.stopPropagation();
      setDraggingSlider(type);
    };

    const handleGlobalMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const currentCurves = curves[activeChannel];

      if (draggingPointIndex !== null) {
        let x = Math.max(0, Math.min(255, Math.round(((clientX - rect.left) / rect.width) * 255)));
        let y = Math.max(0, Math.min(255, Math.round(255 - ((clientY - rect.top) / rect.height) * 255)));

        // Constrain first and last points to x=0 and x=255
        if (draggingPointIndex === 0) x = 0;
        if (draggingPointIndex === currentCurves.length - 1) x = 255;

        // Prevent points from crossing each other
        if (draggingPointIndex > 0 && x <= currentCurves[draggingPointIndex - 1].x) {
          x = currentCurves[draggingPointIndex - 1].x + 1;
        }
        if (draggingPointIndex < currentCurves.length - 1 && x >= currentCurves[draggingPointIndex + 1].x) {
          x = currentCurves[draggingPointIndex + 1].x - 1;
        }

        const newPoints = [...currentCurves];
        newPoints[draggingPointIndex] = { x, y };
        handleAdjustmentChange('curves', { ...curves, [activeChannel]: newPoints });
      } else if (draggingSlider) {
        const x = Math.max(0, Math.min(255, Math.round(((clientX - rect.left) / rect.width) * 255)));
        if (draggingSlider === 'black') {
          handleAdjustmentChange('blackPoint', { ...blackPoint, [activeChannel]: Math.min(x, whitePoint[activeChannel] - 5) });
        } else {
          handleAdjustmentChange('whitePoint', { ...whitePoint, [activeChannel]: Math.max(x, blackPoint[activeChannel] + 5) });
        }
      }
    };

    const handleGlobalMouseUp = () => {
      setDraggingPointIndex(null);
      setDraggingSlider(null);
    };

    React.useEffect(() => {
      if (draggingPointIndex !== null || draggingSlider !== null) {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('touchmove', handleGlobalMouseMove);
        window.addEventListener('touchend', handleGlobalMouseUp);
      }
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        window.removeEventListener('touchmove', handleGlobalMouseMove);
        window.removeEventListener('touchend', handleGlobalMouseUp);
      };
    }, [draggingPointIndex, draggingSlider, curves, blackPoint, whitePoint, activeChannel]);

    const sortedPoints = [...curves[activeChannel]].sort((a, b) => a.x - b.x);
    let pathData = `M ${(sortedPoints[0].x / 255) * 100} ${(1 - sortedPoints[0].y / 255) * 100}`;
    for (let i = 1; i < sortedPoints.length; i++) {
      pathData += ` L ${(sortedPoints[i].x / 255) * 100} ${(1 - sortedPoints[i].y / 255) * 100}`;
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              曲線調整 (Curves)
            </label>
            <p className="text-xs text-zinc-500">控制亮度與色階</p>
          </div>
          <button 
            onClick={() => handleAdjustmentChange({
              curves: {
                rgb: [{x: 0, y: 0}, {x: 255, y: 255}],
                red: [{x: 0, y: 0}, {x: 255, y: 255}],
                green: [{x: 0, y: 0}, {x: 255, y: 255}],
                blue: [{x: 0, y: 0}, {x: 255, y: 255}],
              },
              blackPoint: { rgb: 0, red: 0, green: 0, blue: 0 },
              whitePoint: { rgb: 255, red: 255, green: 255, blue: 255 }
            })}
            className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            重設
          </button>
        </div>

        {/* Channel Selection */}
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
          {[
            { id: 'rgb', label: 'RGB', color: 'text-zinc-600', active: 'bg-white text-zinc-900 shadow-sm' },
            { id: 'red', label: '紅', color: 'text-red-500', active: 'bg-red-500 text-white shadow-sm' },
            { id: 'green', label: '綠', color: 'text-emerald-500', active: 'bg-emerald-500 text-white shadow-sm' },
            { id: 'blue', label: '藍', color: 'text-blue-500', active: 'bg-blue-500 text-white shadow-sm' },
          ].map(ch => (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id as any)}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-bold transition-all",
                activeChannel === ch.id ? ch.active : `${ch.color} hover:bg-zinc-200`
              )}
            >
              {ch.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5 select-none">
          <div className="flex gap-6 items-center">
            <div className="relative w-40 h-40 bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-xl">
            {/* Histogram Background */}
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none opacity-25">
              <path d={histogramPath} fill={
                activeChannel === 'red' ? '#ef4444' : 
                activeChannel === 'green' ? '#10b981' : 
                activeChannel === 'blue' ? '#3b82f6' : '#6366f1'
              } />
            </svg>

            {/* Grid Lines */}
            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none opacity-10">
              {[1, 2, 3].map(i => (
                <React.Fragment key={i}>
                  <div className="absolute top-0 bottom-0 bg-zinc-400 w-[1px]" style={{ left: `${i * 25}%` }} />
                  <div className="absolute left-0 right-0 bg-zinc-400 h-[1px]" style={{ top: `${i * 25}%` }} />
                </React.Fragment>
              ))}
            </div>

            {/* Curves SVG */}
            <svg 
              ref={svgRef}
              viewBox="0 0 100 100" 
              className={cn(
                "absolute inset-0 w-full h-full cursor-crosshair touch-none z-10",
                (draggingPointIndex !== null || draggingSlider !== null) && "cursor-grabbing"
              )}
              onMouseDown={handleCurveMouseDown}
              onTouchStart={handleCurveMouseDown}
            >
              <path 
                d={pathData} 
                fill="none" 
                stroke={
                  activeChannel === 'red' ? '#ef4444' : 
                  activeChannel === 'green' ? '#10b981' : 
                  activeChannel === 'blue' ? '#3b82f6' : '#818cf8'
                } 
                strokeWidth="1.2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
              {sortedPoints.map((p, i) => (
                <g key={i}>
                  {/* Invisible hit area - even larger for easier grabbing */}
                  <circle 
                    cx={(p.x / 255) * 100} 
                    cy={(1 - p.y / 255) * 100} 
                    r="14" 
                    fill="transparent"
                    className="cursor-grab active:cursor-grabbing touch-none"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingPointIndex(i);
                      setActivePoint(i);
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setDraggingPointIndex(i);
                      setActivePoint(i);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const currentCurves = curves[activeChannel];
                      if (currentCurves.length > 2 && i !== 0 && i !== currentCurves.length - 1) {
                        const newPoints = currentCurves.filter((_, idx) => idx !== i);
                        handleAdjustmentChange('curves', { ...curves, [activeChannel]: newPoints });
                        if (activePoint === i) setActivePoint(null);
                      }
                    }}
                  />
                  {/* Visible point */}
                  <circle 
                    cx={(p.x / 255) * 100} 
                    cy={(1 - p.y / 255) * 100} 
                    r={activePoint === i ? "3.5" : "2.5"} 
                    fill={activePoint === i ? (
                      activeChannel === 'red' ? '#ef4444' : 
                      activeChannel === 'green' ? '#10b981' : 
                      activeChannel === 'blue' ? '#3b82f6' : '#818cf8'
                    ) : "white"} 
                    stroke={
                      activeChannel === 'red' ? '#b91c1c' : 
                      activeChannel === 'green' ? '#047857' : 
                      activeChannel === 'blue' ? '#1d4ed8' : '#4f46e5'
                    } 
                    strokeWidth="0.8"
                    className="pointer-events-none"
                  />
                </g>
              ))}
            </svg>
          </div>

          {/* Fine-tuning Buttons - Specifically to the right of the quadrant panel */}
          <div className="flex flex-col gap-4 w-fit">
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">黑點 (Black)</span>
              <div className="flex gap-1">
                <button 
                  onClick={() => handleAdjustmentChange('blackPoint', { ...blackPoint, [activeChannel]: Math.max(0, blackPoint[activeChannel] - 12.75) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向左移動 5%"
                >
                  <ChevronsLeft className="w-3 h-3 text-zinc-600" />
                </button>
                <button 
                  onClick={() => handleAdjustmentChange('blackPoint', { ...blackPoint, [activeChannel]: Math.max(0, blackPoint[activeChannel] - 1.275) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向左移動 0.5%"
                >
                  <ChevronLeft className="w-3 h-3 text-zinc-600" />
                </button>
                <button 
                  onClick={() => handleAdjustmentChange('blackPoint', { ...blackPoint, [activeChannel]: Math.min(whitePoint[activeChannel] - 1, blackPoint[activeChannel] + 1.275) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向右移動 0.5%"
                >
                  <ChevronRight className="w-3 h-3 text-zinc-600" />
                </button>
                <button 
                  onClick={() => handleAdjustmentChange('blackPoint', { ...blackPoint, [activeChannel]: Math.min(whitePoint[activeChannel] - 1, blackPoint[activeChannel] + 12.75) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向右移動 5%"
                >
                  <ChevronsRight className="w-3 h-3 text-zinc-600" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">白點 (White)</span>
              <div className="flex gap-1">
                <button 
                  onClick={() => handleAdjustmentChange('whitePoint', { ...whitePoint, [activeChannel]: Math.max(blackPoint[activeChannel] + 1, whitePoint[activeChannel] - 12.75) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向左移動 5%"
                >
                  <ChevronsLeft className="w-3 h-3 text-zinc-600" />
                </button>
                <button 
                  onClick={() => handleAdjustmentChange('whitePoint', { ...whitePoint, [activeChannel]: Math.max(blackPoint[activeChannel] + 1, whitePoint[activeChannel] - 1.275) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向左移動 0.5%"
                >
                  <ChevronLeft className="w-3 h-3 text-zinc-600" />
                </button>
                <button 
                  onClick={() => handleAdjustmentChange('whitePoint', { ...whitePoint, [activeChannel]: Math.min(255, whitePoint[activeChannel] + 1.275) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向右移動 0.5%"
                >
                  <ChevronRight className="w-3 h-3 text-zinc-600" />
                </button>
                <button 
                  onClick={() => handleAdjustmentChange('whitePoint', { ...whitePoint, [activeChannel]: Math.min(255, whitePoint[activeChannel] + 12.75) })}
                  className="p-1 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
                  title="向右移動 5%"
                >
                  <ChevronsRight className="w-3 h-3 text-zinc-600" />
                </button>
              </div>
            </div>
            
            {/* Input/Output Info */}
            <div className="flex items-center gap-4 pt-2 border-t border-zinc-100">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">In:</span>
                <span className="text-xs font-mono font-bold text-zinc-900 bg-zinc-100 px-1.5 py-0.5 rounded">
                  {activePoint !== null ? curves[activeChannel][activePoint].x : '-'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Out:</span>
                <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {activePoint !== null ? curves[activeChannel][activePoint].y : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Black/White Point Sliders (X-axis) */}
          <div className="relative h-10 w-40 px-0 flex items-center">
            <div className="absolute left-0 right-0 h-1 bg-zinc-200 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "absolute h-full opacity-30",
                  activeChannel === 'red' ? 'bg-red-500' : 
                  activeChannel === 'green' ? 'bg-emerald-500' : 
                  activeChannel === 'blue' ? 'bg-blue-500' : 'bg-indigo-500'
                )}
                style={{ left: `${(blackPoint[activeChannel] / 255) * 100}%`, right: `${100 - (whitePoint[activeChannel] / 255) * 100}%` }}
              />
            </div>
            
            {/* Black Point Slider Handle */}
            <div 
              className="absolute w-12 h-12 flex items-center justify-center cursor-ew-resize z-20 -ml-6 touch-none"
              style={{ left: `${(blackPoint[activeChannel] / 255) * 100}%` }}
              onMouseDown={(e) => handleSliderMouseDown(e, 'black')}
              onTouchStart={(e) => handleSliderMouseDown(e, 'black')}
            >
              <div className={cn(
                "w-4 h-4 bg-zinc-900 border-2 border-white rounded shadow-md transition-transform",
                draggingSlider === 'black' && "scale-125 shadow-indigo-500/50"
              )} />
            </div>

            {/* White Point Slider Handle */}
            <div 
              className="absolute w-12 h-12 flex items-center justify-center cursor-ew-resize z-20 -ml-5 touch-none"
              style={{ left: `${(whitePoint[activeChannel] / 255) * 100}%` }}
              onMouseDown={(e) => handleSliderMouseDown(e, 'white')}
              onTouchStart={(e) => handleSliderMouseDown(e, 'white')}
            >
              <div className={cn(
                "w-4 h-4 bg-white border-2 border-zinc-900 rounded shadow-md transition-transform",
                draggingSlider === 'white' && "scale-125 shadow-indigo-500/50"
              )} />
            </div>
          </div>

        </div>
      </div>
    );
  };

  const downloadImage = () => {
    if (!processedImage) return;
    const link = document.createElement('a');
    link.href = processedImage;
    link.download = 'removed_background.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <RefreshCw className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AI 背景去背工具</h1>
        </div>
        <div className="hidden sm:block text-sm text-zinc-500 font-medium">
          100% 自動且免費
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid lg:grid-cols-12 gap-12">
          {/* Left Column: Hero & Upload */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-4">
              <h2 className="text-5xl font-extrabold leading-[1.1] tracking-tight text-zinc-900">
                一鍵去除圖片背景
              </h2>
              <p className="text-lg text-zinc-600 leading-relaxed">
                使用先進的 AI 技術，在瀏覽器中直接處理圖片，無需上傳到伺服器，保護您的隱私。
              </p>
              
              {/* Background Removal Toggle */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 w-fit">
                  <div 
                    onClick={() => setRemoveBgEnabled(!removeBgEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
                      removeBgEnabled ? "bg-indigo-600" : "bg-zinc-300"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        removeBgEnabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-900">自動去除背景</span>
                    <span className="text-[10px] text-zinc-500 font-medium">預設關閉，開啟後將自動執行去背</span>
                  </div>
                </div>

                {originalImage && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={undo}
                      disabled={historyIndex <= 0}
                      className={cn(
                        "p-3 rounded-xl border transition-all flex items-center justify-center",
                        historyIndex > 0 
                          ? "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm" 
                          : "bg-zinc-50 border-zinc-100 text-zinc-300 cursor-not-allowed"
                      )}
                      title="上一步 (Undo)"
                    >
                      <Undo className="w-4 h-4" />
                    </button>
                    <button
                      onClick={redo}
                      disabled={historyIndex >= history.length - 1}
                      className={cn(
                        "p-3 rounded-xl border transition-all flex items-center justify-center",
                        historyIndex < history.length - 1 
                          ? "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm" 
                          : "bg-zinc-50 border-zinc-100 text-zinc-300 cursor-not-allowed"
                      )}
                      title="下一步 (Redo)"
                    >
                      <Redo className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-zinc-200 mx-1" />
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      disabled={historyIndex <= 0}
                      className={cn(
                        "p-3 rounded-xl border transition-all flex items-center justify-center",
                        historyIndex > 0 
                          ? "bg-white border-zinc-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 shadow-sm" 
                          : "bg-zinc-50 border-zinc-100 text-zinc-300 cursor-not-allowed"
                      )}
                      title="重置回原始狀態 (Reset to Original)"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.avif,image/avif"
                onChange={handleChange}
              />
              
              <AnimatePresence mode="wait">
                {!originalImage ? (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={onButtonClick}
                    className={cn(
                      "group relative cursor-pointer border-2 border-dashed rounded-3xl p-12 transition-all duration-300 flex flex-col items-center justify-center gap-6",
                      dragActive 
                        ? "border-indigo-500 bg-indigo-50/50" 
                        : "border-zinc-200 bg-white hover:border-indigo-400 hover:bg-zinc-50/50"
                    )}
                  >
                    <div className={cn(
                      "w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300",
                      dragActive ? "bg-indigo-500 text-white scale-110" : "bg-zinc-100 text-zinc-400 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                    )}>
                      <Upload className="w-10 h-10" />
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-zinc-900">點擊或拖曳圖片至此</p>
                      <p className="text-zinc-500 mt-1">支援 JPG, PNG, WebP</p>
                    </div>
                    <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-black/5 pointer-events-none" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="actions"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-4"
                  >
                    <button
                      onClick={reset}
                      className="w-full py-4 px-6 bg-white border border-zinc-200 rounded-2xl font-bold text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <RefreshCw className="w-5 h-5" />
                      重新上傳
                    </button>
                    {processedImage && (
                      <div className="space-y-6 pt-4">
                        {/* Adjustments Group */}
                        <div className="space-y-5">
                          {/* Intensity */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700 flex items-center gap-2">
                                去背淨化強度
                                <span className="text-xs font-normal text-zinc-400">(建議值: 12%)</span>
                              </label>
                              <span className="text-sm font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                                {Math.round((intensity / 255) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="254"
                              value={intensity}
                              onChange={handleIntensityChange}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Contrast */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700">對比強度</label>
                              <span className="text-xs font-mono font-bold text-zinc-500">{contrast}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="200"
                              value={contrast}
                              onChange={(e) => handleAdjustmentChange('contrast', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Saturation */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700">飽和度</label>
                              <span className="text-xs font-mono font-bold text-zinc-500">{saturation}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="200"
                              value={saturation}
                              onChange={(e) => handleAdjustmentChange('saturation', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Opacity */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700">透明度</label>
                              <span className="text-xs font-mono font-bold text-zinc-500">{opacity}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={opacity}
                              onChange={(e) => handleAdjustmentChange('opacity', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* B&W Contrast */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700">黑白程度</label>
                              <span className="text-xs font-mono font-bold text-zinc-500">{bwContrast}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={bwContrast}
                              onChange={(e) => handleAdjustmentChange('bwContrast', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Fade */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700">圖片淡化</label>
                              <span className="text-xs font-mono font-bold text-zinc-500">{fade}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={fade}
                              onChange={(e) => handleAdjustmentChange('fade', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Sharpness */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700">邊緣銳利度</label>
                              <span className="text-xs font-mono font-bold text-zinc-500">{sharpness}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={sharpness}
                              onChange={(e) => handleAdjustmentChange('sharpness', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Smoothing */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-zinc-700">模擬邊緣平整</label>
                                <button
                                  onClick={handleAntiAlias}
                                  className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                                  title="一鍵去除鋸齒化邊緣"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  去除鋸齒
                                </button>
                                <button
                                  onClick={handleRemoveWhiteEdges}
                                  className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                                  title="一鍵去除邊緣白邊"
                                >
                                  <Scissors className="w-3 h-3" />
                                  去除白邊
                                </button>
                                <button
                                  onClick={handleStrongRemoveWhiteEdges}
                                  className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                                  title="一鍵強力去除邊緣白邊"
                                >
                                  <Zap className="w-3 h-3" />
                                  加強去白邊
                                </button>
                              </div>
                              <span className="text-xs font-mono font-bold text-zinc-500">{smoothing}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={smoothing}
                              onChange={(e) => handleAdjustmentChange('smoothing', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Denoise */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-sm font-bold text-zinc-700">去除噪點與雜訊</label>
                              <span className="text-xs font-mono font-bold text-zinc-500">{denoise}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={denoise}
                              onChange={(e) => handleAdjustmentChange('denoise', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          {/* Color Unify */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-zinc-700">色彩統一</label>
                                <button
                                  onClick={handleColorUnifyPreset}
                                  className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                                  title="一鍵辨識類似顏色並統一"
                                >
                                  <Palette className="w-3 h-3" />
                                  色彩統一
                                </button>
                              </div>
                              <span className="text-xs font-mono font-bold text-zinc-500">{colorUnify}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={colorUnify}
                              onChange={(e) => handleAdjustmentChange('colorUnify', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <button
                            onClick={downloadImage}
                            className="py-4 px-4 bg-indigo-600 rounded-2xl font-bold text-white hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-[0.98]"
                          >
                            <Download className="w-5 h-5" />
                            下載 PNG
                          </button>
                          <button
                            onClick={async () => {
                              if (!processedImage || !rawImageData) return;
                              
                              setIsProcessing(true);
                              try {
                                // Create a temporary image to get the processed pixels
                                const img = new Image();
                                img.crossOrigin = "anonymous";
                                
                                await new Promise((resolve, reject) => {
                                  img.onload = resolve;
                                  img.onerror = reject;
                                  img.src = processedImage;
                                });

                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                if (!ctx) throw new Error("Could not get canvas context");
                                
                                ctx.drawImage(img, 0, 0);
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                                // Perform Ultra-High Quality vectorization
                                // options: ltres: error threshold, qtres: corner threshold, pathomit: omit small paths
                                if (!ImageTracer || typeof ImageTracer.imagedataToSVG !== 'function') {
                                  throw new Error("ImageTracer library not properly loaded");
                                }

                                // Ultra-High Quality Settings
                                const svgString = ImageTracer.imagedataToSVG(imageData, {
                                  ltres: 0.01,       // Extremely low threshold for maximum detail
                                  qtres: 0.01,       // Extremely low threshold for maximum detail
                                  pathomit: 0,        // Do not omit any paths, keep every detail
                                  colorsampling: 2,   // Deterministic color sampling
                                  numberofcolors: 256, // Maximum colors (256) for photographic fidelity
                                  mincolorratio: 0,   // Include every single color found
                                  colorquantcycles: 5, // More cycles for better color grouping
                                  blurradius: 0.5,    // Slight blur to reduce noise artifacts from removal
                                  blurdelta: 10,      // Finer blur control
                                  scale: 1,
                                  simplifytolerance: 0,
                                  roundcoords: 3,     // High precision coordinates (3 decimal places)
                                  lcpr: 0,
                                  qcpr: 0,
                                  desc: false,
                                  viewbox: true
                                });

                                const blob = new Blob([svgString], { type: 'image/svg+xml' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = 'vectorized_image.svg';
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(url);
                              } catch (err) {
                                console.error("Vectorization failed:", err);
                                setError("向量化失敗，請重試");
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                            disabled={isProcessing}
                            className="py-4 px-4 bg-white border border-zinc-200 rounded-2xl font-bold text-zinc-700 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Zap className="w-5 h-5 text-amber-500" />
                            )}
                            下載向量 SVG
                          </button>
                          <button
                            onClick={async () => {
                              if (!processedImage || !rawImageData) return;
                              
                              setIsProcessing(true);
                              try {
                                // 1. Generate SVG first (same ultra-high quality)
                                const img = new Image();
                                img.crossOrigin = "anonymous";
                                await new Promise((resolve, reject) => {
                                  img.onload = resolve;
                                  img.onerror = reject;
                                  img.src = processedImage;
                                });

                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                if (!ctx) throw new Error("Could not get canvas context");
                                ctx.drawImage(img, 0, 0);
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                                const svgString = ImageTracer.imagedataToSVG(imageData, {
                                  ltres: 0.01, qtres: 0.01, pathomit: 0, colorsampling: 2,
                                  numberofcolors: 256, mincolorratio: 0, colorquantcycles: 5,
                                  blurradius: 0.5, blurdelta: 10, scale: 1, simplifytolerance: 0,
                                  roundcoords: 3, lcpr: 0, qcpr: 0, desc: false, viewbox: true
                                });

                                // 2. Create PDF with PDF/X-4:2008 intent
                                const pdf = new jsPDF({
                                  orientation: canvas.width > canvas.height ? 'l' : 'p',
                                  unit: 'px',
                                  format: [canvas.width, canvas.height],
                                  putOnlyUsedFonts: true,
                                  compress: true
                                });

                                // Set PDF/X-4 Metadata & ICC Color Description
                                pdf.setProperties({
                                  title: 'Ultra-High Fidelity Vector PDF/X-4',
                                  subject: 'Professional Vector Export with ICC Color Intent',
                                  author: 'AI Studio Professional Export',
                                  keywords: 'vector, pdf, x-4, icc, srgb',
                                  creator: 'AI Studio Background Remover'
                                });

                                // Add OutputIntent for PDF/X-4 compliance (ICC Color Description)
                                // This tells the PDF viewer/printer to use sRGB color space for rendering
                                const pdfInternal = (pdf as any).internal;
                                const outputIntentObj = pdfInternal.newObject();
                                pdfInternal.out(`${outputIntentObj} 0 obj`);
                                pdfInternal.out('<<');
                                pdfInternal.out('/Type /OutputIntent');
                                pdfInternal.out('/S /GTS_PDFX'); // PDF/X standard
                                pdfInternal.out('/OutputConditionIdentifier (sRGB IEC61966-2.1)');
                                pdfInternal.out('/RegistryName (http://www.color.org)');
                                pdfInternal.out('/Info (sRGB IEC61966-2.1)');
                                pdfInternal.out('>>');
                                pdfInternal.out('endobj');

                                // Link OutputIntent to the Catalog
                                pdfInternal.events.subscribe('postPutResources', () => {
                                  pdfInternal.out(`/OutputIntents [${outputIntentObj} 0 R]`);
                                });
                                
                                // Parse SVG string to DOM
                                const parser = new DOMParser();
                                const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
                                const svgElement = svgDoc.documentElement;

                                // Use svg2pdf to render with high precision
                                await svg2pdf(svgElement, pdf, {
                                  x: 0,
                                  y: 0,
                                  width: canvas.width,
                                  height: canvas.height,
                                });

                                // Finalize and download
                                pdf.save('vectorized_pro_icc.pdf');
                              } catch (err) {
                                console.error("PDF generation failed:", err);
                                setError("PDF 生成失敗，請重試");
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                            disabled={isProcessing}
                            className="py-4 px-4 bg-white border border-zinc-200 rounded-2xl font-bold text-zinc-700 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                            )}
                            下載向量 PDF
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-red-500 text-sm font-medium flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  {error}
                </motion.p>
              )}
            </div>
          </div>

          {/* Right Column: Preview Area */}
          <div className="lg:col-span-7 space-y-6">
            {/* Curves & Advanced Tools Section */}
            <AnimatePresence>
              {originalImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-stretch gap-4"
                >
                  <div className="p-4 bg-white rounded-3xl border border-zinc-200 shadow-lg shadow-zinc-200/30 w-fit">
                    <CurvesControl />
                  </div>

                  {/* Advanced Repair Section - Moved here */}
                  <div className="p-5 bg-white rounded-3xl border border-zinc-200 shadow-lg shadow-zinc-200/30 space-y-4 flex flex-col justify-center min-w-[200px]">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      進階修復工具
                    </label>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleRemoveWatermark}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors border border-zinc-100 shadow-sm"
                        title="自動辨識並去除圖片中的浮水印"
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        去除浮水印
                      </button>
                      <button
                        onClick={handleForceRemoveWatermark}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors border border-zinc-100 shadow-sm"
                        title="強力辨識並去除各種頑固浮水印"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        強制去除浮水印
                      </button>
                      <button
                        onClick={handleRemoveText}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors border border-zinc-100 shadow-sm"
                        title="強制清除圖片中可能的文字與框線內容"
                      >
                        <Type className="w-3.5 h-3.5" />
                        去除文字與框線
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-xl shadow-zinc-200/50 overflow-hidden min-h-[400px] flex flex-col">
              <div className="px-8 py-6 border-bottom border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-zinc-500" />
                  </div>
                  <span className="font-bold text-zinc-700">處理預覽</span>
                </div>
                {isProcessing && (
                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    去背處理中...
                  </div>
                )}
                {processedImage && !isProcessing && (
                  <div className="flex items-center gap-2">
                    <div className="flex bg-zinc-200/50 p-1 rounded-lg gap-1">
                      <button
                        onClick={() => setPreviewBg('checkerboard')}
                        className={cn(
                          "p-1.5 rounded-md transition-all",
                          previewBg === 'checkerboard' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                        )}
                        title="棋盤格背景"
                      >
                        <Grid3X3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPreviewBg('white')}
                        className={cn(
                          "p-1.5 rounded-md transition-all",
                          previewBg === 'white' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                        )}
                        title="白色背景"
                      >
                        <Sun className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPreviewBg('black')}
                        className={cn(
                          "p-1.5 rounded-md transition-all",
                          previewBg === 'black' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                        )}
                        title="黑色背景"
                      >
                        <Moon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm ml-2">
                      <CheckCircle2 className="w-4 h-4" />
                      處理完成
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-8">
                {!originalImage ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4 opacity-50">
                    <div className="w-24 h-24 rounded-full border-4 border-dashed border-zinc-200 flex items-center justify-center">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                    <p className="font-medium">尚未上傳圖片</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-8 h-full">
                    {/* Original */}
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">原始圖片</p>
                      <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200 relative group">
                        <img 
                          src={originalImage} 
                          alt="Original" 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>

                    {/* Result */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">去背結果</p>
                        {processedImage && !isProcessing && (
                          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                            <button
                              onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
                              className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-zinc-500 hover:text-indigo-600"
                              title="縮小"
                            >
                              <ZoomOut className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] font-mono font-bold text-zinc-400 min-w-[30px] text-center">
                              {Math.round(zoom * 100)}%
                            </span>
                            <button
                              onClick={() => setZoom(prev => Math.min(12, prev + 0.25))}
                              className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-zinc-500 hover:text-indigo-600"
                              title="放大"
                            >
                              <ZoomIn className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-px h-3 bg-zinc-200 mx-0.5" />
                            <button
                              onClick={() => setZoom(1)}
                              className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-zinc-500 hover:text-indigo-600"
                              title="顯示全圖"
                            >
                              <Maximize className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className={cn(
                        "aspect-square rounded-2xl overflow-hidden border border-zinc-200 relative transition-colors duration-300",
                        previewBg === 'checkerboard' && "bg-checkerboard",
                        previewBg === 'white' && "bg-white",
                        previewBg === 'black' && "bg-zinc-950"
                      )}>
                        <AnimatePresence mode="wait">
                          {isProcessing ? (
                            <motion.div
                              key="processing"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10"
                            >
                              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                              <p className="text-zinc-900 font-bold">AI 正在計算中</p>
                              <p className="text-zinc-500 text-sm">這可能需要幾秒鐘</p>
                            </motion.div>
                          ) : processedImage ? (
                            <div className="w-full h-full overflow-auto custom-scrollbar">
                              <div 
                                className="flex items-center justify-center min-w-full min-h-full"
                                style={{ 
                                  width: zoom > 1 ? `${zoom * 100}%` : '100%',
                                  height: zoom > 1 ? `${zoom * 100}%` : '100%',
                                }}
                              >
                                <motion.img
                                  key="result"
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1 }}
                                  src={processedImage}
                                  alt="Processed"
                                  className="max-w-full max-h-full object-contain relative z-10 transition-all duration-200 ease-out"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            </div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* White Balance Section (Quadrant Style) - Moved below preview */}
            <AnimatePresence>
              {originalImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-6 bg-white rounded-[2rem] border border-zinc-200 shadow-lg shadow-zinc-200/30 flex items-center gap-8"
                >
                  <div className="flex flex-col gap-1 min-w-[120px]">
                    <label className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                      <Palette className="w-4 h-4 text-indigo-600" />
                      白平衡象限儀
                    </label>
                    <p className="text-xs text-zinc-500">調整圖片色彩平衡</p>
                    <button 
                      onClick={() => {
                        handleAdjustmentChange({ temperature: 0, tint: 0 });
                      }}
                      className="mt-4 w-fit px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重設中心
                    </button>
                  </div>

                  <div className="flex gap-8 items-center flex-1">
                    {/* Quadrant Control */}
                    <div 
                      ref={wbQuadrantRef}
                      onMouseDown={(e) => {
                        handleWBQuadrantInteraction(e);
                        const handleMouseMove = (moveEvent: MouseEvent) => handleWBQuadrantInteraction(moveEvent as any);
                        const handleMouseUp = () => {
                          window.removeEventListener('mousemove', handleMouseMove);
                          window.removeEventListener('mouseup', handleMouseUp);
                        };
                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                      }}
                      onTouchStart={(e) => {
                        handleWBQuadrantInteraction(e);
                        const handleTouchMove = (moveEvent: TouchEvent) => handleWBQuadrantInteraction(moveEvent as any);
                        const handleTouchEnd = () => {
                          window.removeEventListener('touchmove', handleTouchMove);
                          window.removeEventListener('touchend', handleTouchEnd);
                        };
                        window.addEventListener('touchmove', handleTouchMove);
                        window.addEventListener('touchend', handleTouchEnd);
                      }}
                      className="relative w-40 h-40 rounded-2xl border border-zinc-200 cursor-crosshair overflow-hidden shadow-inner bg-white"
                      style={{
                        background: `
                          linear-gradient(to right, rgba(59, 130, 246, 0.15), rgba(245, 158, 11, 0.15)),
                          linear-gradient(to top, rgba(16, 185, 129, 0.15), rgba(236, 72, 153, 0.15))
                        `
                      }}
                    >
                      {/* Axis Lines */}
                      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-zinc-300/40" />
                      <div className="absolute top-0 left-1/2 w-[1px] h-full bg-zinc-300/40" />
                      
                      {/* Labels */}
                      <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-pink-500/50 uppercase tracking-widest">洋紅</span>
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-500/50 uppercase tracking-widest">綠色</span>
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500/50 uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">藍色</span>
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-500/50 uppercase tracking-widest [writing-mode:vertical-rl]">黃色</span>

                      {/* Handle */}
                      <motion.div 
                        animate={{ 
                          left: `${((temperature + 100) / 200) * 100}%`,
                          top: `${(100 - tint) / 2}%`
                        }}
                        transition={{ type: "spring", damping: 25, stiffness: 400 }}
                        className="absolute w-4 h-4 -ml-2 -mt-2 bg-white border-2 border-indigo-600 rounded-full shadow-lg z-10 pointer-events-none flex items-center justify-center"
                      >
                        <div className="w-1 h-1 bg-indigo-600 rounded-full" />
                      </motion.div>
                    </div>

                    {/* Numeric Feedback */}
                    <div className="grid grid-cols-2 gap-8 flex-1">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">色溫 (Temperature)</span>
                        <input
                          type="number"
                          min="-100"
                          max="100"
                          value={temperature}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            handleAdjustmentChange('temperature', isNaN(val) ? 0 : Math.max(-100, Math.min(100, val)));
                          }}
                          className={cn(
                            "bg-transparent border-none p-0 focus:ring-0 w-full text-2xl font-mono font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all hover:bg-zinc-50 focus:bg-zinc-50 rounded-lg px-1 -ml-1",
                            temperature > 0 ? "text-amber-600" : temperature < 0 ? "text-blue-600" : "text-zinc-300"
                          )}
                        />
                        <div className="relative h-6 flex items-center">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={temperature}
                            onChange={(e) => handleAdjustmentChange('temperature', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-zinc-100 rounded-full appearance-none cursor-pointer accent-amber-500"
                            style={{ 
                              accentColor: temperature > 0 ? '#f59e0b' : temperature < 0 ? '#3b82f6' : '#6366f1' 
                            }}
                          />
                        </div>
                        <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden -mt-1 opacity-50">
                          <motion.div 
                            className={cn("h-full", temperature > 0 ? "bg-amber-500" : "bg-blue-500")}
                            animate={{ width: `${Math.abs(temperature)}%`, marginLeft: temperature > 0 ? '50%' : `${50 - Math.abs(temperature)}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">色調 (Tint)</span>
                        <input
                          type="number"
                          min="-100"
                          max="100"
                          value={tint}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            handleAdjustmentChange('tint', isNaN(val) ? 0 : Math.max(-100, Math.min(100, val)));
                          }}
                          className={cn(
                            "bg-transparent border-none p-0 focus:ring-0 w-full text-2xl font-mono font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all hover:bg-zinc-50 focus:bg-zinc-50 rounded-lg px-1 -ml-1",
                            tint > 0 ? "text-pink-600" : tint < 0 ? "text-emerald-600" : "text-zinc-300"
                          )}
                        />
                        <div className="relative h-6 flex items-center">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={tint}
                            onChange={(e) => handleAdjustmentChange('tint', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-zinc-100 rounded-full appearance-none cursor-pointer accent-pink-500"
                            style={{ 
                              accentColor: tint > 0 ? '#db2777' : tint < 0 ? '#10b981' : '#6366f1' 
                            }}
                          />
                        </div>
                        <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden -mt-1 opacity-50">
                          <motion.div 
                            className={cn("h-full", tint > 0 ? "bg-pink-500" : "bg-emerald-500")}
                            animate={{ width: `${Math.abs(tint)}%`, marginLeft: tint > 0 ? '50%' : `${50 - Math.abs(tint)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Features List */}
            <div className="mt-12 grid grid-cols-3 gap-6">
              {[
                { title: "隱私保護", desc: "本地端處理，不傳雲端" },
                { title: "高解析度", desc: "保持原始圖片品質" },
                { title: "完全免費", desc: "無浮水印，無限制" }
              ].map((feature, i) => (
                <div key={i} className="space-y-1">
                  <h4 className="font-bold text-zinc-900">{feature.title}</h4>
                  <p className="text-sm text-zinc-500">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-12">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-2">
          <div className="text-zinc-400 text-sm font-medium">
            &copy; {new Date().getFullYear()} AI Background Remover. Powered by @imgly/background-removal.
          </div>
          <div className="text-zinc-400 text-xs font-medium flex items-center justify-center gap-4">
            <span>Author: Kevin Weng</span>
            <span className="w-1 h-1 bg-zinc-300 rounded-full" />
            <span>Version 1.0</span>
          </div>
        </div>
      </footer>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-zinc-900">確認重置圖片？</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    這將會捨棄目前所有的修改紀錄，並回到圖片最初上傳的狀態。此動作無法復原。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-2xl transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      resetToOriginal();
                      setShowResetConfirm(false);
                    }}
                    className="py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-rose-200"
                  >
                    確認重置
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
