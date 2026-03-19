import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Trash2, Plus, Minus, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, X, MousePointer2, FileJson, Image as ImageIcon, RotateCcw, RotateCw, RefreshCw, FlipHorizontal, FlipVertical, FileArchive, CheckSquare, Library, Undo2, Redo2, Brush, AlertTriangle, ArrowUpToLine, ArrowDownToLine, ChevronUp, ChevronDown } from 'lucide-react';
import JSZip from 'jszip';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://smijcwocgnygwnpbmelx.supabase.co/';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWpjd29jZ255Z3ducGJtZWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjc0ODQsImV4cCI6MjA4NTcwMzQ4NH0.ASlu4Fkaah9cOHDRy21OYJWTxioyJwkam8gaC74irkI';
const supabase = createClient(supabaseUrl, supabaseKey);

interface BlockTemplate {
  id: string;
  url: string;
  imageElement: HTMLImageElement;
  defaultW: number;
  defaultH: number;
  name?: string;
  isPreset?: boolean;
  isHidden?: boolean;
}

interface PlacedObject {
  id: string;
  templateId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  hue?: number;
  brightness?: number;
  contrast?: number;
}

const getFilterString = (obj: PlacedObject) => {
  const filters = [];
  if (obj.hue) filters.push(`hue-rotate(${obj.hue}deg)`);
  if (obj.brightness !== undefined && obj.brightness !== 100) filters.push(`brightness(${obj.brightness}%)`);
  if (obj.contrast !== undefined && obj.contrast !== 100) filters.push(`contrast(${obj.contrast}%)`);
  return filters.length > 0 ? filters.join(' ') : 'none';
};

const CELL_SIZE = 40;
const GRID_HEIGHT = 13;
const EXPORT_SECTION_WIDTH = 15;
const EXPORT_SECTION_HEIGHT = 13;

export default function App() {
  const [templates, setTemplates] = useState<BlockTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [transformMode, setTransformMode] = useState<'group' | 'individual'>('group');
  const [gridWidth, setGridWidth] = useState(30);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [replaceTemplateId, setReplaceTemplateId] = useState<string | null>(null);

  const [isDragBuildMode, setIsDragBuildMode] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastBuiltPos, setLastBuiltPos] = useState<{ x: number, y: number } | null>(null);

  const [history, setHistory] = useState<PlacedObject[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<PlacedObject[][]>([[]]);
  const historyIndexRef = useRef<number>(0);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [hasWarnedMassResize, setHasWarnedMassResize] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'color'>('build');
  const [hasSeenColorWarning, setHasSeenColorWarning] = useState(false);
  const [showColorWarning, setShowColorWarning] = useState(false);
  const [activeHue, setActiveHue] = useState<number | null>(null);
  const [activeBrightness, setActiveBrightness] = useState<number | null>(null);
  const [activeContrast, setActiveContrast] = useState<number | null>(null);

  useEffect(() => {
    setActiveHue(null);
    setActiveBrightness(null);
    setActiveContrast(null);
  }, [selectedObjectIds]);

  useEffect(() => {
    setHasWarnedMassResize(false);
  }, [selectedObjectIds]);

  const updatePlacedObjects = (newObjectsOrUpdater: PlacedObject[] | ((prev: PlacedObject[]) => PlacedObject[]), skipHistory = false) => {
    setPlacedObjects(prev => {
      const next = typeof newObjectsOrUpdater === 'function' ? newObjectsOrUpdater(prev) : newObjectsOrUpdater;
      
      if (!skipHistory) {
        const currentHistoryState = historyRef.current[historyIndexRef.current];
        if (JSON.stringify(currentHistoryState) !== JSON.stringify(next)) {
          setHistory(currentHistory => {
            const newHistory = currentHistory.slice(0, historyIndexRef.current + 1);
            newHistory.push(next);
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
          });
          setHistoryIndex(prevIndex => {
            const newIndex = Math.min(prevIndex + 1, 50);
            historyIndexRef.current = newIndex;
            return newIndex;
          });
        }
      }
      return next;
    });
  };

  const commitHistory = () => {
    setPlacedObjects(prev => {
      const currentHistoryState = historyRef.current[historyIndexRef.current];
      if (JSON.stringify(currentHistoryState) !== JSON.stringify(prev)) {
        setHistory(currentHistory => {
          const newHistory = currentHistory.slice(0, historyIndexRef.current + 1);
          newHistory.push(prev);
          if (newHistory.length > 50) newHistory.shift();
          return newHistory;
        });
        setHistoryIndex(prevIndex => {
          const newIndex = Math.min(prevIndex + 1, 50);
          historyIndexRef.current = newIndex;
          return newIndex;
        });
      }
      return prev;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      setPlacedObjects(history[newIndex]);
      setSelectedObjectIds([]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      setPlacedObjects(history[newIndex]);
      setSelectedObjectIds([]);
    }
  };

  const confirmDelete = () => {
    if (selectedObjectIds.length > 1) {
      setConfirmModal({
        title: 'Mass Delete',
        message: `Are you sure you want to delete ${selectedObjectIds.length} objects?`,
        onConfirm: () => {
          updatePlacedObjects(prev => prev.filter(o => !selectedObjectIds.includes(o.id)));
          setSelectedObjectIds([]);
        }
      });
    } else {
      updatePlacedObjects(prev => prev.filter(o => !selectedObjectIds.includes(o.id)));
      setSelectedObjectIds([]);
    }
  };

  useEffect(() => {
    const loadPresets = async () => {
      try {
        const { data, error } = await supabase.storage.from('Music').list();
        if (error) {
          console.error('Error loading presets:', error);
          return;
        }

        if (data) {
          const files = data.filter(f => f.name.endsWith('.png') || f.name.endsWith('.svg') || f.name.endsWith('.webp'));
          
          files.forEach(file => {
            const { data: publicUrlData } = supabase.storage.from('Music').getPublicUrl(file.name);
            const url = publicUrlData.publicUrl;
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = url;
            img.onload = () => {
              let defaultW = Math.max(1, Math.round(img.width / CELL_SIZE));
              let defaultH = Math.max(1, Math.round(img.height / CELL_SIZE));
              
              if (file.name.toUpperCase().includes('IMG')) {
                defaultW = 1;
                defaultH = 1;
              }
              
              setTemplates(prev => {
                if (prev.some(t => t.url === url)) return prev;
                
                // Find highest existing ID to avoid collisions
                let maxId = 0;
                prev.forEach(t => {
                  const idNum = parseInt(t.id, 10);
                  if (!isNaN(idNum) && idNum > maxId) {
                    maxId = idNum;
                  }
                });
                
                return [...prev, {
                  id: (maxId + 1).toString(),
                  url,
                  imageElement: img,
                  defaultW,
                  defaultH,
                  name: file.name,
                  isPreset: true
                }];
              });
            };
          });
        }
      } catch (err) {
        console.error('Failed to load presets:', err);
      }
    };

    loadPresets();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    // Find highest existing ID to avoid collisions
    let maxId = 0;
    templates.forEach(t => {
      const num = parseInt(t.id);
      if (!isNaN(num) && num > maxId) maxId = num;
    });
    let currentId = maxId + 1;

    Array.from(files as Iterable<File>).forEach(file => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      const id = String(currentId++);
      img.onload = () => {
        const defaultW = Math.max(1, Math.round(img.width / CELL_SIZE));
        const defaultH = Math.max(1, Math.round(img.height / CELL_SIZE));
        setTemplates(prev => [...prev, { id, url, imageElement: img, defaultW, defaultH, name: file.name, isPreset: false }]);
      };
    });
    e.target.value = '';
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>, templateId: string) => {
    const file = e.target.files?.[0];
    if (!file || !templateId) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const defaultW = Math.max(1, Math.round(img.width / CELL_SIZE));
      const defaultH = Math.max(1, Math.round(img.height / CELL_SIZE));
      setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, url, imageElement: img, defaultW, defaultH, name: file.name, isPreset: false } : t));
      updatePlacedObjects(prev => prev.map(obj => {
        if (obj.templateId === templateId) {
          return { ...obj, w: defaultW, h: defaultH };
        }
        return obj;
      }));
    };
    e.target.value = '';
  };

  const handleReplaceWithExisting = (oldTemplateId: string, newTemplateId: string) => {
    const newTemplate = templates.find(t => t.id === newTemplateId);
    if (!newTemplate) return;
    
    updatePlacedObjects(prev => prev.map(obj => {
      if (obj.templateId === oldTemplateId) {
        return { 
          ...obj, 
          templateId: newTemplateId,
          w: newTemplate.defaultW,
          h: newTemplate.defaultH
        };
      }
      return obj;
    }));
  };

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (isDragBuildMode) return; // Handled by mouse down/move
    if (!selectedTemplateId) {
      setSelectedObjectIds([]);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    const template = templates.find(t => t.id === selectedTemplateId);
    const w = template ? template.defaultW : 1;
    const h = template ? template.defaultH : 1;

    updatePlacedObjects(prev => [...prev, {
      id: Math.random().toString(),
      templateId: selectedTemplateId,
      x, y, w, h
    }]);

    if (x >= gridWidth - 5) {
      setGridWidth(prev => prev + 15);
    }
  };

  const rotatePoint = (x: number, y: number, cx: number, cy: number, angleDeg: number) => {
    const angleRad = angleDeg * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  };

  const getSelectionBounds = () => {
    const selected = placedObjects.filter(o => selectedObjectIds.includes(o.id));
    if (selected.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selected.forEach(o => {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.w);
      maxY = Math.max(maxY, o.y + o.h);
    });
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, minX, minY, maxX, maxY };
  };

  const handleMove = (dx: number, dy: number) => {
    updatePlacedObjects(prev => prev.map(obj => {
      if (selectedObjectIds.includes(obj.id)) {
        return { ...obj, x: obj.x + dx, y: obj.y + dy };
      }
      return obj;
    }));
  };

  const handleScale = (dw: number, dh: number) => {
    const performScale = () => {
      if (transformMode === 'individual' || selectedObjectIds.length <= 1) {
        updatePlacedObjects(prev => prev.map(obj => {
          if (selectedObjectIds.includes(obj.id)) {
            return { ...obj, w: Math.max(0.5, obj.w + dw), h: Math.max(0.5, obj.h + dh) };
          }
          return obj;
        }));
      } else {
        const bounds = getSelectionBounds();
        if (!bounds) return;
        const { cx, cy, minX, minY, maxX, maxY } = bounds;
        const groupW = maxX - minX;
        const groupH = maxY - minY;
        
        const scaleX = groupW > 0 ? (groupW + dw) / groupW : 1;
        const scaleY = groupH > 0 ? (groupH + dh) / groupH : 1;
        
        updatePlacedObjects(prev => prev.map(obj => {
          if (!selectedObjectIds.includes(obj.id)) return obj;
          
          const ocx = obj.x + obj.w / 2;
          const ocy = obj.y + obj.h / 2;
          
          const newOcx = cx + (ocx - cx) * scaleX;
          const newOcy = cy + (ocy - cy) * scaleY;
          
          const newW = Math.max(0.5, obj.w * scaleX);
          const newH = Math.max(0.5, obj.h * scaleY);
          
          return {
            ...obj,
            x: newOcx - newW / 2,
            y: newOcy - newH / 2,
            w: newW,
            h: newH
          };
        }));
      }
    };

    if (selectedObjectIds.length > 1 && !hasWarnedMassResize) {
      setConfirmModal({
        title: 'Mass Resize',
        message: `Are you sure you want to resize ${selectedObjectIds.length} objects?`,
        onConfirm: () => {
          setHasWarnedMassResize(true);
          performScale();
        }
      });
      return;
    }

    performScale();
  };

  const handleRotate = (angleDelta: number) => {
    if (transformMode === 'individual' || selectedObjectIds.length <= 1) {
      updatePlacedObjects(prev => prev.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          return { ...obj, rotation: ((obj.rotation || 0) + angleDelta) % 360 };
        }
        return obj;
      }));
    } else {
      const bounds = getSelectionBounds();
      if (!bounds) return;
      const { cx, cy } = bounds;
      
      updatePlacedObjects(prev => prev.map(obj => {
        if (!selectedObjectIds.includes(obj.id)) return obj;
        
        const ocx = obj.x + obj.w / 2;
        const ocy = obj.y + obj.h / 2;
        
        const rotatedCenter = rotatePoint(ocx, ocy, cx, cy, angleDelta);
        
        return {
          ...obj,
          x: rotatedCenter.x - obj.w / 2,
          y: rotatedCenter.y - obj.h / 2,
          rotation: ((obj.rotation || 0) + angleDelta) % 360
        };
      }));
    }
  };

  const handleFlipX = () => {
    if (transformMode === 'individual' || selectedObjectIds.length <= 1) {
      updatePlacedObjects(prev => prev.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          return { ...obj, flipX: !obj.flipX };
        }
        return obj;
      }));
    } else {
      const bounds = getSelectionBounds();
      if (!bounds) return;
      const { cx } = bounds;
      
      updatePlacedObjects(prev => prev.map(obj => {
        if (!selectedObjectIds.includes(obj.id)) return obj;
        
        const ocx = obj.x + obj.w / 2;
        const mirroredCx = cx - (ocx - cx);
        
        return {
          ...obj,
          x: mirroredCx - obj.w / 2,
          flipX: !obj.flipX
        };
      }));
    }
  };

  const handleFlipY = () => {
    if (transformMode === 'individual' || selectedObjectIds.length <= 1) {
      updatePlacedObjects(prev => prev.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          return { ...obj, flipY: !obj.flipY };
        }
        return obj;
      }));
    } else {
      const bounds = getSelectionBounds();
      if (!bounds) return;
      const { cy } = bounds;
      
      updatePlacedObjects(prev => prev.map(obj => {
        if (!selectedObjectIds.includes(obj.id)) return obj;
        
        const ocy = obj.y + obj.h / 2;
        const mirroredCy = cy - (ocy - cy);
        
        return {
          ...obj,
          y: mirroredCy - obj.h / 2,
          flipY: !obj.flipY
        };
      }));
    }
  };

  const handleLayerFront = () => {
    updatePlacedObjects(prev => {
      const selected = prev.filter(o => selectedObjectIds.includes(o.id));
      const unselected = prev.filter(o => !selectedObjectIds.includes(o.id));
      return [...unselected, ...selected];
    });
  };

  const handleLayerBack = () => {
    updatePlacedObjects(prev => {
      const selected = prev.filter(o => selectedObjectIds.includes(o.id));
      const unselected = prev.filter(o => !selectedObjectIds.includes(o.id));
      return [...selected, ...unselected];
    });
  };

  const handleLayerUp = () => {
    updatePlacedObjects(prev => {
      const result = [...prev];
      for (let i = result.length - 2; i >= 0; i--) {
        if (selectedObjectIds.includes(result[i].id) && !selectedObjectIds.includes(result[i+1].id)) {
          [result[i], result[i+1]] = [result[i+1], result[i]];
        }
      }
      return result;
    });
  };

  const handleLayerDown = () => {
    updatePlacedObjects(prev => {
      const result = [...prev];
      for (let i = 1; i < result.length; i++) {
        if (selectedObjectIds.includes(result[i].id) && !selectedObjectIds.includes(result[i-1].id)) {
          [result[i], result[i-1]] = [result[i-1], result[i]];
        }
      }
      return result;
    });
  };

  const updateGridWidth = (objects: PlacedObject[]) => {
    const maxX = Math.max(...objects.map(o => o.x + o.w), 30);
    setGridWidth(Math.ceil(maxX + 15));
  };

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.objects) {
          const newObjects: PlacedObject[] = [];
          const newTemplates: BlockTemplate[] = [];
          let loadedCount = 0;

          if (data.properties?.customTemplates) {
            data.properties.customTemplates.forEach((t: any) => {
              const img = new Image();
              img.src = t.dataUrl;
              img.onload = () => {
                const defaultW = Math.max(1, Math.round(img.width / CELL_SIZE));
                const defaultH = Math.max(1, Math.round(img.height / CELL_SIZE));
                newTemplates.push({ id: t.id, url: t.dataUrl, imageElement: img, defaultW, defaultH });
                loadedCount++;
                if (loadedCount === data.properties.customTemplates.length) {
                  setTemplates(prev => {
                    const presets = prev.filter(p => p.isPreset);
                    const filteredNew = newTemplates.filter(nt => !presets.some(p => p.id === nt.id));
                    return [...presets, ...filteredNew];
                  });
                  data.objects.forEach((o: any) => {
                    const template = newTemplates.find(temp => temp.id === (o.templateId || String(o.id)));
                    const w = o.w || (template ? template.defaultW : 1);
                    const h = o.h || (template ? template.defaultH : 1);
                    
                    let x = (o.x / 30) - (w / 2);
                    let y = GRID_HEIGHT - (o.y / 30) - (h / 2);
                    
                    if (Math.abs(x - Math.round(x)) < 0.05) x = Math.round(x);
                    if (Math.abs(y - Math.round(y)) < 0.05) y = Math.round(y);

                    newObjects.push({
                      id: Math.random().toString(),
                      templateId: o.templateId || String(o.id),
                      x,
                      y,
                      w,
                      h,
                      rotation: o.rotation || 0,
                      flipX: o.flipX || false,
                      flipY: o.flipY || false,
                      hue: o.hue || 0,
                      brightness: o.brightness ?? 100,
                      contrast: o.contrast ?? 100
                    });
                  });
                  updatePlacedObjects(newObjects);
                  updateGridWidth(newObjects);
                }
              };
            });
          } else {
            const uniqueIds = Array.from(new Set(data.objects.map((o: any) => o.id)));
            if (uniqueIds.length === 0) {
              updatePlacedObjects([]);
              setHistory([[]]);
              setHistoryIndex(0);
              return;
            }
            uniqueIds.forEach(id => {
              const canvas = document.createElement('canvas');
              canvas.width = 40;
              canvas.height = 40;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = `hsl(${(id as number) * 137 % 360}, 70%, 50%)`;
                ctx.fillRect(0, 0, 40, 40);
                ctx.fillStyle = 'white';
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(id), 20, 20);
              }
              const dataUrl = canvas.toDataURL();
              const img = new Image();
              img.src = dataUrl;
              img.onload = () => {
                newTemplates.push({ id: `imported_${id}`, url: dataUrl, imageElement: img, defaultW: 1, defaultH: 1, isHidden: true });
                loadedCount++;
                if (loadedCount === uniqueIds.length) {
                  setTemplates(prev => {
                    const presets = prev.filter(p => p.isPreset);
                    const filteredNew = newTemplates.filter(nt => !presets.some(p => p.id === nt.id));
                    return [...presets, ...filteredNew];
                  });
                  data.objects.forEach((o: any) => {
                    const w = o.w || 1;
                    const h = o.h || 1;
                    let x = (o.x / 30) - (w / 2);
                    let y = GRID_HEIGHT - (o.y / 30) - (h / 2);
                    
                    if (Math.abs(x - Math.round(x)) < 0.05) x = Math.round(x);
                    if (Math.abs(y - Math.round(y)) < 0.05) y = Math.round(y);

                    newObjects.push({
                      id: Math.random().toString(),
                      templateId: `imported_${o.id}`,
                      x,
                      y,
                      w,
                      h,
                      rotation: o.rotation || 0,
                      flipX: o.flipX || false,
                      flipY: o.flipY || false
                    });
                  });
                  updatePlacedObjects(newObjects);
                  updateGridWidth(newObjects);
                }
              };
            });
          }
        }
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportJson = async () => {
    if (placedObjects.length === 0) {
      alert("Level is empty!");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const templatesData = templates.map(t => {
        const canvas = document.createElement('canvas');
        canvas.width = t.imageElement.width;
        canvas.height = t.imageElement.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(t.imageElement, 0, 0);
        return { id: t.id, dataUrl: canvas.toDataURL('image/png') };
      });

      setExportProgress(33);
      await new Promise(r => setTimeout(r, 10));

      const gdObjects = placedObjects.map(obj => ({
        id: parseInt(obj.templateId) || 1,
        x: (obj.x + obj.w / 2) * 30,
        y: (GRID_HEIGHT - obj.y - obj.h / 2) * 30,
        w: obj.w,
        h: obj.h,
        rotation: obj.rotation || 0,
        flipX: obj.flipX || false,
        flipY: obj.flipY || false,
        hue: obj.hue || 0,
        brightness: obj.brightness ?? 100,
        contrast: obj.contrast ?? 100,
        templateId: obj.templateId
      }));

      setExportProgress(66);
      await new Promise(r => setTimeout(r, 10));

      const data = {
        properties: {
          customTemplates: templatesData,
          songOffset: 0,
          gamemode: "cube",
          speed: 1
        },
        objects: gdObjects
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      setExportProgress(100);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gd_level.json';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const exportSVG = async () => {
    if (placedObjects.length === 0) {
      alert("Level is empty!");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const SVG_SECTION_WIDTH = 12;
      const maxGridX = Math.max(...placedObjects.map(o => o.x + o.w), SVG_SECTION_WIDTH);
      const width = maxGridX * CELL_SIZE;

      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 360" width="${width}" height="360">\n`;
      svgContent += `  <g transform="translate(${width / 2}, 180)">\n`;
      
      for (let i = 0; i < placedObjects.length; i++) {
        const obj = placedObjects[i];
        const template = templates.find(t => t.id === obj.templateId);
        if (template) {
          const canvas = document.createElement('canvas');
          canvas.width = template.imageElement.width;
          canvas.height = template.imageElement.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(template.imageElement, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          
          const drawX = obj.x * CELL_SIZE - (width / 2);
          const drawY = obj.y * CELL_SIZE - 500;
          const drawW = obj.w * CELL_SIZE;
          const drawH = obj.h * CELL_SIZE;
          
          const centerX = drawX + drawW / 2;
          const centerY = drawY + drawH / 2;
          svgContent += `    <image href="${dataUrl}" x="${drawX}" y="${drawY}" width="${drawW}" height="${drawH}" preserveAspectRatio="xMidYMid meet" transform="translate(${centerX}, ${centerY}) rotate(${obj.rotation || 0}) scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1}) translate(${-centerX}, ${-centerY})" style="filter: ${getFilterString(obj)};" />\n`;
        }

        if (i % 50 === 0) {
          setExportProgress((i / placedObjects.length) * 100);
          await new Promise(r => setTimeout(r, 0));
        }
      }

      svgContent += `  </g>\n</svg>`;

      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gd_level.svg';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const exportSVGParts = async () => {
    if (placedObjects.length === 0) {
      alert("Level is empty!");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const SVG_SECTION_WIDTH = 12; // 12 * 40 = 480
      const maxGridX = Math.max(...placedObjects.map(o => o.x + o.w), SVG_SECTION_WIDTH);
      const numSections = Math.ceil(maxGridX / SVG_SECTION_WIDTH);
      const zip = new JSZip();

      for (let i = 0; i < numSections; i++) {
        const startX = i * SVG_SECTION_WIDTH;
        const endX = startX + SVG_SECTION_WIDTH;
        const width = SVG_SECTION_WIDTH * CELL_SIZE; // 480

        const sectionObjects = placedObjects.filter(obj => obj.x < endX && obj.x + obj.w > startX);
        
        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">\n`;
        svgContent += `  <g transform="translate(240, 180)">\n`;
        
        sectionObjects.forEach(obj => {
          const template = templates.find(t => t.id === obj.templateId);
          if (template) {
            const canvas = document.createElement('canvas');
            canvas.width = template.imageElement.width;
            canvas.height = template.imageElement.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(template.imageElement, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            
            const drawX = (obj.x - startX) * CELL_SIZE - 240;
            const drawY = obj.y * CELL_SIZE - 500;
            const drawW = obj.w * CELL_SIZE;
            const drawH = obj.h * CELL_SIZE;
            
            const centerX = drawX + drawW / 2;
            const centerY = drawY + drawH / 2;
            
            svgContent += `    <image href="${dataUrl}" x="${drawX}" y="${drawY}" width="${drawW}" height="${drawH}" preserveAspectRatio="xMidYMid meet" transform="translate(${centerX}, ${centerY}) rotate(${obj.rotation || 0}) scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1}) translate(${-centerX}, ${-centerY})" style="filter: ${getFilterString(obj)};" />\n`;
          }
        });

        svgContent += `  </g>\n</svg>`;
        zip.file(`section_${i + 1}.svg`, svgContent);
        
        setExportProgress(((i + 1) / numSections) * 50);
        await new Promise(r => setTimeout(r, 10)); // Yield to UI
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setExportProgress(50 + (metadata.percent / 2));
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gd_level_svg_parts.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const exportLevel = async () => {
    if (placedObjects.length === 0) {
      alert("Level is empty!");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const maxGridX = Math.max(...placedObjects.map(o => o.x + o.w), EXPORT_SECTION_WIDTH);
      const numSections = Math.ceil(maxGridX / EXPORT_SECTION_WIDTH);
      const zip = new JSZip();

      for (let i = 0; i < numSections; i++) {
        const canvas = document.createElement('canvas');
        const EXPORT_CELL_SIZE = 128; // 15 * 128 = 1920 (1080p width)
        canvas.width = EXPORT_SECTION_WIDTH * EXPORT_CELL_SIZE;
        canvas.height = EXPORT_SECTION_HEIGHT * EXPORT_CELL_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const startX = i * EXPORT_SECTION_WIDTH;
        const endX = startX + EXPORT_SECTION_WIDTH;

        placedObjects.forEach(obj => {
          if (obj.x < endX && obj.x + obj.w > startX) {
            const template = templates.find(t => t.id === obj.templateId);
            if (template && template.imageElement) {
              const drawX = (obj.x - startX) * EXPORT_CELL_SIZE;
              const drawY = obj.y * EXPORT_CELL_SIZE;
              const drawW = obj.w * EXPORT_CELL_SIZE;
              const drawH = obj.h * EXPORT_CELL_SIZE;
              
              // Calculate aspect ratio to fit (like object-fit: contain)
              const imgW = template.imageElement.width;
              const imgH = template.imageElement.height;
              const scale = Math.min(drawW / imgW, drawH / imgH);
              const finalW = imgW * scale;
              const finalH = imgH * scale;
              const finalX = drawX + (drawW - finalW) / 2;
              const finalY = drawY + (drawH - finalH) / 2;

              const centerX = finalX + finalW / 2;
              const centerY = finalY + finalH / 2;

              ctx.save();
              ctx.translate(centerX, centerY);
              ctx.rotate((obj.rotation || 0) * Math.PI / 180);
              ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
              const filterStr = getFilterString(obj);
              if (filterStr !== 'none') {
                ctx.filter = filterStr;
              }
              ctx.drawImage(template.imageElement, -finalW / 2, -finalH / 2, finalW, finalH);
              ctx.restore();
            }
          }
        });

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
        if (blob) {
          zip.file(`section_${i + 1}.png`, blob);
        }
        
        setExportProgress(((i + 1) / numSections) * 50);
        await new Promise(r => setTimeout(r, 10)); // Yield to UI
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setExportProgress(50 + (metadata.percent / 2));
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gd_level_export.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsDragging(true);
      if (scrollContainerRef.current) {
        setDragStart({
          x: e.clientX,
          y: e.clientY,
          scrollLeft: scrollContainerRef.current.scrollLeft,
          scrollTop: scrollContainerRef.current.scrollTop
        });
      }
    } else if (e.button === 0 && isDragBuildMode && selectedTemplateId && gridRef.current) {
      setIsBuilding(true);
      const rect = gridRef.current.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
      const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
      setLastBuiltPos({ x, y });
      
      const template = templates.find(t => t.id === selectedTemplateId);
      const w = template ? template.defaultW : 1;
      const h = template ? template.defaultH : 1;

      updatePlacedObjects(prev => [...prev, {
        id: Math.random().toString(),
        templateId: selectedTemplateId,
        x, y, w, h
      }]);

      if (x >= gridWidth - 5) {
        setGridWidth(prev => prev + 15);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scrollContainerRef.current) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      scrollContainerRef.current.scrollLeft = dragStart.scrollLeft - dx;
      scrollContainerRef.current.scrollTop = dragStart.scrollTop - dy;
    } else if (isBuilding && isDragBuildMode && selectedTemplateId && gridRef.current) {
      const rect = gridRef.current.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
      const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
      
      if (!lastBuiltPos || lastBuiltPos.x !== x || lastBuiltPos.y !== y) {
        setLastBuiltPos({ x, y });
        const template = templates.find(t => t.id === selectedTemplateId);
        const w = template ? template.defaultW : 1;
        const h = template ? template.defaultH : 1;

        updatePlacedObjects(prev => {
          return [...prev, {
            id: Math.random().toString(),
            templateId: selectedTemplateId,
            x, y, w, h
          }];
        });

        if (x >= gridWidth - 5) {
          setGridWidth(prev => prev + 15);
        }
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsBuilding(false);
    setLastBuiltPos(null);
  };

  const selectedObjs = placedObjects.filter(o => selectedObjectIds.includes(o.id));
  const isMultiSelected = selectedObjs.length > 1;
  const singleSelectedObj = selectedObjs.length === 1 ? selectedObjs[0] : null;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {isExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl w-full max-w-md flex flex-col items-center">
            <h2 className="text-xl font-bold text-emerald-400 mb-4">Exporting Level...</h2>
            <div className="w-full bg-zinc-800 rounded-full h-4 mb-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-4 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${exportProgress}%` }}
              ></div>
            </div>
            <p className="text-zinc-400 text-sm font-medium">{Math.round(exportProgress)}% Complete</p>
          </div>
        </div>
      )}
      {replaceTemplateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setReplaceTemplateId(null)}>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-xl font-bold text-zinc-100">Replace All</h2>
              <button onClick={() => setReplaceTemplateId(null)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
            </div>
            <p className="text-zinc-400 text-sm mb-4 shrink-0">Choose how you want to replace all instances of this object.</p>
            
            <div className="flex flex-col gap-3 overflow-hidden flex-1">
              <label className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer rounded-xl transition-colors font-semibold shrink-0">
                <Upload size={18} />
                Upload New Image
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  handleReplaceImage(e, replaceTemplateId);
                  setReplaceTemplateId(null);
                }} />
              </label>

              <div className="relative flex items-center py-2 shrink-0">
                <div className="flex-grow border-t border-zinc-800"></div>
                <span className="flex-shrink-0 mx-4 text-zinc-500 text-xs uppercase font-bold tracking-wider">Or select existing</span>
                <div className="flex-grow border-t border-zinc-800"></div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 overflow-y-auto p-2 min-h-0">
                {templates.filter(t => t.id !== replaceTemplateId && !t.isHidden).map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      handleReplaceWithExisting(replaceTemplateId, t.id);
                      setReplaceTemplateId(null);
                    }}
                    className="aspect-square bg-zinc-800 rounded-lg border border-zinc-700 hover:border-emerald-500 overflow-hidden flex items-center justify-center p-2 transition-colors"
                  >
                    <img src={t.url} alt="Template" className="max-w-full max-h-full object-contain" />
                  </button>
                ))}
                {templates.filter(t => t.id !== replaceTemplateId && !t.isHidden).length === 0 && (
                  <div className="col-span-full text-center py-4 text-zinc-500 text-sm">No other templates available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setConfirmModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-zinc-100">{confirmModal.title}</h2>
              <button onClick={() => setConfirmModal(null)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
            </div>
            <p className="text-zinc-400 text-sm mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold rounded-xl transition-colors text-sm">Cancel</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold rounded-xl transition-colors text-sm">Confirm</button>
            </div>
          </div>
        </div>
      )}
      {showColorWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowColorWarning(false)}>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-md flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 text-amber-500">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-bold text-zinc-100">Color Warning</h2>
            </div>
            <p className="text-zinc-300 text-sm mb-6 leading-relaxed">
              Be careful, I recommend you go to the scratch projects and see the colors of the portals, orbs, spike outline, ect. Due to the way this project works, I recommend checking to not cause decorations to act as an orb, and any fully solid white objects act as solids.
            </p>
            <div className="flex justify-end">
              <button onClick={() => setShowColorWarning(false)} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold rounded-xl transition-colors text-sm">Understood</button>
            </div>
          </div>
        </div>
      )}
      <header className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-emerald-400">GD Level Maker</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-2 bg-zinc-800 p-1 rounded-xl">
            <button onClick={undo} disabled={historyIndex === 0} className="p-1.5 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 rounded-lg transition-colors" title="Undo">
              <Undo2 size={16} />
            </button>
            <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-1.5 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 rounded-lg transition-colors" title="Redo">
              <Redo2 size={16} />
            </button>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold rounded-xl transition-colors cursor-pointer text-sm">
            <Upload size={16} />
            <span className="hidden sm:inline">Import JSON</span>
            <input type="file" accept=".json" className="hidden" onChange={importJson} />
          </label>
          <button onClick={exportJson} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold rounded-xl transition-colors text-sm">
            <FileJson size={16} />
            <span className="hidden sm:inline">JSON</span>
          </button>
          <button onClick={exportSVG} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold rounded-xl transition-colors text-sm">
            <ImageIcon size={16} />
            <span className="hidden sm:inline">SVG</span>
          </button>
          <button onClick={exportSVGParts} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold rounded-xl transition-colors text-sm">
            <FileArchive size={16} />
            <span className="hidden sm:inline">SVG Zip</span>
          </button>
          <button onClick={exportLevel} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold rounded-xl transition-colors text-sm">
            <Download size={16} />
            <span className="hidden sm:inline">PNG Zip</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <aside className="w-full md:w-96 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 order-2 md:order-1 h-48 md:h-auto">
          <div className="flex border-b border-zinc-800 shrink-0">
            <button 
              className={`flex-1 py-3 text-sm font-bold tracking-wider uppercase transition-colors ${activeTab === 'build' ? 'bg-zinc-800 text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`} 
              onClick={() => setActiveTab('build')}
            >
              Build
            </button>
            <button 
              className={`flex-1 py-3 text-sm font-bold tracking-wider uppercase transition-colors ${activeTab === 'color' ? 'bg-zinc-800 text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`} 
              onClick={() => {
                setActiveTab('color');
                if (!hasSeenColorWarning) {
                  setShowColorWarning(true);
                  setHasSeenColorWarning(true);
                }
              }}
            >
              Color
            </button>
          </div>

          {activeTab === 'build' ? (
            <>
              <div className="p-4 border-b border-zinc-800 flex flex-col gap-2 shrink-0">
                <label className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 cursor-pointer rounded-xl transition-colors font-medium">
                  <Upload size={18} />
                  Upload Blocks
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                </label>
                <button 
                  onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                  className={`flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl transition-colors font-medium ${isMultiSelectMode ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'}`}
                >
                  <CheckSquare size={18} />
                  {isMultiSelectMode ? 'Multi-Select On' : 'Multi-Select Off'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tools</h3>
                  <div className="grid grid-cols-5 md:grid-cols-4 gap-2 content-start">
                    <button
                      onClick={() => { setSelectedTemplateId(null); setIsDragBuildMode(false); }}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-zinc-800 ${selectedTemplateId === null ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'}`}
                    >
                      <MousePointer2 size={24} />
                      <span className="text-[10px] font-medium uppercase">Select</span>
                    </button>
                    <button
                      onClick={() => setIsDragBuildMode(!isDragBuildMode)}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-zinc-800 ${isDragBuildMode ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'}`}
                      title="Drag Build"
                    >
                      <Brush size={24} />
                      <span className="text-[10px] font-medium uppercase text-center leading-tight">Drag<br/>Build</span>
                    </button>
                    <button
                      onClick={handleLayerUp}
                      disabled={selectedObjectIds.length === 0}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-zinc-800 border-transparent text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700`}
                      title="Layer Up"
                    >
                      <ChevronUp size={24} />
                      <span className="text-[10px] font-medium uppercase text-center leading-tight">Layer<br/>Up</span>
                    </button>
                    <button
                      onClick={handleLayerDown}
                      disabled={selectedObjectIds.length === 0}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-zinc-800 border-transparent text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700`}
                      title="Layer Down"
                    >
                      <ChevronDown size={24} />
                      <span className="text-[10px] font-medium uppercase text-center leading-tight">Layer<br/>Down</span>
                    </button>
                    <button
                      onClick={handleLayerFront}
                      disabled={selectedObjectIds.length === 0}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-zinc-800 border-transparent text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700`}
                      title="Layer Front"
                    >
                      <ArrowUpToLine size={24} />
                      <span className="text-[10px] font-medium uppercase text-center leading-tight">Layer<br/>Front</span>
                    </button>
                    <button
                      onClick={handleLayerBack}
                      disabled={selectedObjectIds.length === 0}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-zinc-800 border-transparent text-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-700`}
                      title="Layer Back"
                    >
                      <ArrowDownToLine size={24} />
                      <span className="text-[10px] font-medium uppercase text-center leading-tight">Layer<br/>Back</span>
                    </button>
                  </div>
                </div>

                {templates.filter(t => !t.isPreset && !t.isHidden).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">My Blocks</h3>
                    <div className="grid grid-cols-5 md:grid-cols-4 gap-2 content-start">
                      {templates.filter(t => !t.isPreset && !t.isHidden).map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTemplateId(t.id); setSelectedObjectIds([]); }}
                          className={`aspect-square rounded-lg border-2 overflow-hidden bg-zinc-800 ${selectedTemplateId === t.id ? 'border-emerald-500' : 'border-transparent'}`}
                          title={t.name}
                        >
                          <img src={t.url} alt="block" className="w-full h-full object-contain" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {templates.filter(t => t.isPreset && !t.isHidden).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Presets</h3>
                    <div className="grid grid-cols-5 md:grid-cols-4 gap-2 content-start">
                      {templates.filter(t => t.isPreset && !t.isHidden).map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTemplateId(t.id); setSelectedObjectIds([]); }}
                          className={`aspect-square rounded-lg border-2 overflow-hidden bg-zinc-800 ${selectedTemplateId === t.id ? 'border-emerald-500' : 'border-transparent'}`}
                          title={t.name}
                        >
                          <img src={t.url} alt="block" className="w-full h-full object-contain" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Hue Adjust</h3>
                {selectedObjectIds.length > 0 ? (
                  <div className="flex flex-col gap-4 bg-zinc-800/50 p-4 rounded-xl border border-zinc-800">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-zinc-200">Hue Rotation</label>
                      <span className="text-xs font-mono bg-zinc-900 px-2 py-1 rounded text-emerald-400">
                        {activeHue !== null ? activeHue : (singleSelectedObj?.hue || 0)}°
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="360" 
                      value={activeHue !== null ? activeHue : (singleSelectedObj?.hue || 0)} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setActiveHue(val);
                        updatePlacedObjects(prev => prev.map(obj => {
                          if (selectedObjectIds.includes(obj.id)) {
                            return { ...obj, hue: val };
                          }
                          return obj;
                        }), true);
                      }}
                      onMouseUp={() => {
                        if (activeHue !== null) {
                          commitHistory();
                        }
                      }}
                      onTouchEnd={() => {
                        if (activeHue !== null) {
                          commitHistory();
                        }
                      }}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-500 font-medium">
                      <span>0°</span>
                      <span>180°</span>
                      <span>360°</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-zinc-800 rounded-xl">
                    <MousePointer2 size={32} className="text-zinc-600 mb-3" />
                    <p className="text-sm text-zinc-400 font-medium">Select objects on the grid to change their color.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col relative order-1 md:order-2 overflow-hidden bg-zinc-950">
          <div 
            className="flex-1 overflow-auto relative p-4 md:p-8" 
            id="grid-scroll-container"
            ref={scrollContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              ref={gridRef}
              className="relative bg-zinc-900/50 border border-zinc-800"
              style={{
                width: gridWidth * CELL_SIZE,
                height: GRID_HEIGHT * CELL_SIZE,
                backgroundImage: `linear-gradient(to right, #27272a 1px, transparent 1px), linear-gradient(to bottom, #27272a 1px, transparent 1px)`,
                backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
                cursor: isDragging ? 'grabbing' : (selectedTemplateId ? 'crosshair' : 'default')
              }}
              onClick={handleGridClick}
            >
              {Array.from({ length: Math.ceil(gridWidth / 15) }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-r-2 border-emerald-500/30 pointer-events-none"
                  style={{ left: (i + 1) * 15 * CELL_SIZE }}
                />
              ))}

              {placedObjects.map(obj => {
                const template = templates.find(t => t.id === obj.templateId);
                const isSelected = selectedObjectIds.includes(obj.id);
                return (
                  <div
                    key={obj.id}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (isMultiSelectMode) {
                        setSelectedObjectIds(prev => 
                          prev.includes(obj.id) ? prev.filter(id => id !== obj.id) : [...prev, obj.id]
                        );
                      } else {
                        setSelectedObjectIds([obj.id]); 
                      }
                      setSelectedTemplateId(null); 
                    }}
                    className={`absolute cursor-pointer bg-no-repeat bg-center bg-contain ${isSelected ? 'ring-2 ring-emerald-400 z-10' : 'z-0'}`}
                    style={{
                      left: obj.x * CELL_SIZE,
                      top: obj.y * CELL_SIZE,
                      width: obj.w * CELL_SIZE,
                      height: obj.h * CELL_SIZE,
                      backgroundImage: template ? `url(${template.url})` : 'none',
                      transform: `rotate(${obj.rotation || 0}deg) scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1})`,
                      filter: getFilterString(obj)
                    }}
                  />
                );
              })}
            </div>
          </div>

          {selectedObjectIds.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl p-3 flex flex-col gap-3 text-sm z-50">
              {isMultiSelected && (
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-xs text-zinc-400">Transform:</span>
                  <button 
                    onClick={() => setTransformMode('group')}
                    className={`px-2 py-1 rounded text-xs ${transformMode === 'group' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                  >Group</button>
                  <button 
                    onClick={() => setTransformMode('individual')}
                    className={`px-2 py-1 rounded text-xs ${transformMode === 'individual' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                  >Individual</button>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
                  <span className="px-2 text-zinc-400 text-xs font-medium">W</span>
                  <button onClick={() => handleScale(-0.5, 0)} className="p-1 hover:bg-zinc-700 rounded"><Minus size={14} /></button>
                  <span className="w-8 text-center">{isMultiSelected ? '-' : singleSelectedObj?.w}</span>
                  <button onClick={() => handleScale(0.5, 0)} className="p-1 hover:bg-zinc-700 rounded"><Plus size={14} /></button>
                </div>
                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
                  <span className="px-2 text-zinc-400 text-xs font-medium">H</span>
                  <button onClick={() => handleScale(0, -0.5)} className="p-1 hover:bg-zinc-700 rounded"><Minus size={14} /></button>
                  <span className="w-8 text-center">{isMultiSelected ? '-' : singleSelectedObj?.h}</span>
                  <button onClick={() => handleScale(0, 0.5)} className="p-1 hover:bg-zinc-700 rounded"><Plus size={14} /></button>
                </div>
                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
                  <button onClick={() => handleRotate(-45)} className="p-1 hover:bg-zinc-700 rounded"><RotateCcw size={14} /></button>
                  <span className="w-10 text-center text-xs">{isMultiSelected ? '-' : `${singleSelectedObj?.rotation || 0}°`}</span>
                  <button onClick={() => handleRotate(45)} className="p-1 hover:bg-zinc-700 rounded"><RotateCw size={14} /></button>
                  <div className="w-px h-4 bg-zinc-700 mx-1"></div>
                  <button onClick={() => handleFlipX()} className={`p-1 rounded ${!isMultiSelected && singleSelectedObj?.flipX ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-zinc-700'}`}>
                    <FlipHorizontal size={14} />
                  </button>
                  <button onClick={() => handleFlipY()} className={`p-1 rounded ${!isMultiSelected && singleSelectedObj?.flipY ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-zinc-700'}`}>
                    <FlipVertical size={14} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
                  <button onClick={() => handleMove(-0.5, 0)} className="p-1 hover:bg-zinc-700 rounded"><ArrowLeft size={14} /></button>
                  <button onClick={() => handleMove(0.5, 0)} className="p-1 hover:bg-zinc-700 rounded"><ArrowRight size={14} /></button>
                  <button onClick={() => handleMove(0, -0.5)} className="p-1 hover:bg-zinc-700 rounded"><ArrowUp size={14} /></button>
                  <button onClick={() => handleMove(0, 0.5)} className="p-1 hover:bg-zinc-700 rounded"><ArrowDown size={14} /></button>
                </div>
                <div className="flex items-center gap-1">
                  {!isMultiSelected && singleSelectedObj && (
                    <button onClick={() => setReplaceTemplateId(singleSelectedObj.templateId)} className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer rounded-lg transition-colors font-medium text-xs">
                      <RefreshCw size={14} />
                      Replace All
                    </button>
                  )}
                  <button onClick={() => confirmDelete()} className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg"><Trash2 size={16} /></button>
                  <button onClick={() => setSelectedObjectIds([])} className="p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg"><X size={16} /></button>
                </div>
              </div>
              {!isMultiSelected && singleSelectedObj && (
                <div className="flex items-center gap-2 mt-1 pt-3 border-t border-zinc-700">
                  <span className="text-xs text-zinc-400 font-medium">Apply to all of this type:</span>
                  <button onClick={() => {
                    const count = placedObjects.filter(o => o.templateId === singleSelectedObj.templateId).length;
                    if (count > 1) {
                      setConfirmModal({
                        title: 'Mass Resize',
                        message: `Are you sure you want to resize all ${count} objects of this type?`,
                        onConfirm: () => updatePlacedObjects(prev => prev.map(o => o.templateId === singleSelectedObj.templateId ? { ...o, w: singleSelectedObj.w, h: singleSelectedObj.h } : o))
                      });
                    } else {
                      updatePlacedObjects(prev => prev.map(o => o.templateId === singleSelectedObj.templateId ? { ...o, w: singleSelectedObj.w, h: singleSelectedObj.h } : o));
                    }
                  }} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">Scale</button>
                  <button onClick={() => {
                    const count = placedObjects.filter(o => o.templateId === singleSelectedObj.templateId).length;
                    if (count > 1) {
                      setConfirmModal({
                        title: 'Mass Rotate/Flip',
                        message: `Are you sure you want to rotate/flip all ${count} objects of this type?`,
                        onConfirm: () => updatePlacedObjects(prev => prev.map(o => o.templateId === singleSelectedObj.templateId ? { ...o, rotation: singleSelectedObj.rotation, flipX: singleSelectedObj.flipX, flipY: singleSelectedObj.flipY } : o))
                      });
                    } else {
                      updatePlacedObjects(prev => prev.map(o => o.templateId === singleSelectedObj.templateId ? { ...o, rotation: singleSelectedObj.rotation, flipX: singleSelectedObj.flipX, flipY: singleSelectedObj.flipY } : o));
                    }
                  }} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">Rotate/Flip</button>
                  <button onClick={() => {
                    const count = placedObjects.filter(o => o.templateId === singleSelectedObj.templateId).length;
                    if (count > 1) {
                      setConfirmModal({
                        title: 'Mass Delete',
                        message: `Are you sure you want to delete all ${count} objects of this type?`,
                        onConfirm: () => {
                          updatePlacedObjects(prev => prev.filter(o => o.templateId !== singleSelectedObj.templateId));
                          setSelectedObjectIds([]);
                        }
                      });
                    } else {
                      updatePlacedObjects(prev => prev.filter(o => o.templateId !== singleSelectedObj.templateId));
                      setSelectedObjectIds([]);
                    }
                  }} className="px-2 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-xs">Delete</button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
