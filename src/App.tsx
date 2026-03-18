import React, { useState, useRef } from 'react';
import { Upload, Download, Trash2, Plus, Minus, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, X, MousePointer2, FileJson, Image as ImageIcon, RotateCcw, RotateCw, RefreshCw, FlipHorizontal, FlipVertical, FileArchive, CheckSquare } from 'lucide-react';
import JSZip from 'jszip';

interface BlockTemplate {
  id: string;
  url: string;
  imageElement: HTMLImageElement;
  defaultW: number;
  defaultH: number;
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
}

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

    Array.from(files).forEach(file => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      const id = String(currentId++);
      img.onload = () => {
        const defaultW = Math.max(1, Math.round(img.width / CELL_SIZE));
        const defaultH = Math.max(1, Math.round(img.height / CELL_SIZE));
        setTemplates(prev => [...prev, { id, url, imageElement: img, defaultW, defaultH }]);
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
      setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, url, imageElement: img, defaultW, defaultH } : t));
      setPlacedObjects(prev => prev.map(obj => {
        if (obj.templateId === templateId) {
          return { ...obj, w: defaultW, h: defaultH };
        }
        return obj;
      }));
    };
    e.target.value = '';
  };

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
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

    setPlacedObjects(prev => [...prev, {
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
    setPlacedObjects(prev => prev.map(obj => {
      if (selectedObjectIds.includes(obj.id)) {
        return { ...obj, x: obj.x + dx, y: obj.y + dy };
      }
      return obj;
    }));
  };

  const handleScale = (dw: number, dh: number) => {
    if (transformMode === 'individual' || selectedObjectIds.length <= 1) {
      setPlacedObjects(prev => prev.map(obj => {
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
      
      setPlacedObjects(prev => prev.map(obj => {
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

  const handleRotate = (angleDelta: number) => {
    if (transformMode === 'individual' || selectedObjectIds.length <= 1) {
      setPlacedObjects(prev => prev.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          return { ...obj, rotation: ((obj.rotation || 0) + angleDelta) % 360 };
        }
        return obj;
      }));
    } else {
      const bounds = getSelectionBounds();
      if (!bounds) return;
      const { cx, cy } = bounds;
      
      setPlacedObjects(prev => prev.map(obj => {
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
      setPlacedObjects(prev => prev.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          return { ...obj, flipX: !obj.flipX };
        }
        return obj;
      }));
    } else {
      const bounds = getSelectionBounds();
      if (!bounds) return;
      const { cx } = bounds;
      
      setPlacedObjects(prev => prev.map(obj => {
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
      setPlacedObjects(prev => prev.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          return { ...obj, flipY: !obj.flipY };
        }
        return obj;
      }));
    } else {
      const bounds = getSelectionBounds();
      if (!bounds) return;
      const { cy } = bounds;
      
      setPlacedObjects(prev => prev.map(obj => {
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
                  setTemplates(newTemplates);
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
                      flipY: o.flipY || false
                    });
                  });
                  setPlacedObjects(newObjects);
                  updateGridWidth(newObjects);
                }
              };
            });
          } else {
            const uniqueIds = Array.from(new Set(data.objects.map((o: any) => o.id)));
            if (uniqueIds.length === 0) {
              setPlacedObjects([]);
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
                newTemplates.push({ id: String(id), url: dataUrl, imageElement: img, defaultW: 1, defaultH: 1 });
                loadedCount++;
                if (loadedCount === uniqueIds.length) {
                  setTemplates(newTemplates);
                  data.objects.forEach((o: any) => {
                    const w = o.w || 1;
                    const h = o.h || 1;
                    let x = (o.x / 30) - (w / 2);
                    let y = GRID_HEIGHT - (o.y / 30) - (h / 2);
                    
                    if (Math.abs(x - Math.round(x)) < 0.05) x = Math.round(x);
                    if (Math.abs(y - Math.round(y)) < 0.05) y = Math.round(y);

                    newObjects.push({
                      id: Math.random().toString(),
                      templateId: String(o.id),
                      x,
                      y,
                      w,
                      h,
                      rotation: o.rotation || 0,
                      flipX: o.flipX || false,
                      flipY: o.flipY || false
                    });
                  });
                  setPlacedObjects(newObjects);
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
      const maxGridX = Math.max(...placedObjects.map(o => o.x + o.w), EXPORT_SECTION_WIDTH);
      const width = maxGridX * CELL_SIZE;
      const height = GRID_HEIGHT * CELL_SIZE;

      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
      
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
          
          const centerX = obj.x * CELL_SIZE + (obj.w * CELL_SIZE) / 2;
          const centerY = obj.y * CELL_SIZE + (obj.h * CELL_SIZE) / 2;
          svgContent += `  <image href="${dataUrl}" x="${obj.x * CELL_SIZE}" y="${obj.y * CELL_SIZE}" width="${obj.w * CELL_SIZE}" height="${obj.h * CELL_SIZE}" preserveAspectRatio="xMidYMid meet" transform="translate(${centerX}, ${centerY}) rotate(${obj.rotation || 0}) scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1}) translate(${-centerX}, ${-centerY})" />\n`;
        }

        if (i % 50 === 0) {
          setExportProgress((i / placedObjects.length) * 100);
          await new Promise(r => setTimeout(r, 0));
        }
      }

      svgContent += `</svg>`;

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
      const maxGridX = Math.max(...placedObjects.map(o => o.x + o.w), EXPORT_SECTION_WIDTH);
      const numSections = Math.ceil(maxGridX / EXPORT_SECTION_WIDTH);
      const zip = new JSZip();

      for (let i = 0; i < numSections; i++) {
        const startX = i * EXPORT_SECTION_WIDTH;
        const endX = startX + EXPORT_SECTION_WIDTH;
        const width = EXPORT_SECTION_WIDTH * CELL_SIZE;
        const height = GRID_HEIGHT * CELL_SIZE;

        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
        
        placedObjects.forEach(obj => {
          if (obj.x < endX && obj.x + obj.w > startX) {
            const template = templates.find(t => t.id === obj.templateId);
            if (template) {
              const canvas = document.createElement('canvas');
              canvas.width = template.imageElement.width;
              canvas.height = template.imageElement.height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(template.imageElement, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              
              const drawX = (obj.x - startX) * CELL_SIZE;
              const drawY = obj.y * CELL_SIZE;
              const drawW = obj.w * CELL_SIZE;
              const drawH = obj.h * CELL_SIZE;
              
              const centerX = drawX + drawW / 2;
              const centerY = drawY + drawH / 2;
              
              svgContent += `  <image href="${dataUrl}" x="${drawX}" y="${drawY}" width="${drawW}" height="${drawH}" preserveAspectRatio="xMidYMid meet" transform="translate(${centerX}, ${centerY}) rotate(${obj.rotation || 0}) scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1}) translate(${-centerX}, ${-centerY})" />\n`;
            }
          }
        });

        svgContent += `</svg>`;
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
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scrollContainerRef.current) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      scrollContainerRef.current.scrollLeft = dragStart.scrollLeft - dx;
      scrollContainerRef.current.scrollTop = dragStart.scrollTop - dy;
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
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
      <header className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-emerald-400">GD Level Maker</h1>
        <div className="flex items-center gap-2">
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
        <aside className="w-full md:w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 order-2 md:order-1 h-48 md:h-auto">
          <div className="p-4 border-b border-zinc-800 flex flex-col gap-2">
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
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-4 md:grid-cols-2 gap-2 content-start">
            <button
              onClick={() => setSelectedTemplateId(null)}
              className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-zinc-800 ${selectedTemplateId === null ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'}`}
            >
              <MousePointer2 size={24} />
              <span className="text-[10px] font-medium uppercase">Select</span>
            </button>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTemplateId(t.id); setSelectedObjectIds([]); }}
                className={`aspect-square rounded-lg border-2 overflow-hidden bg-zinc-800 ${selectedTemplateId === t.id ? 'border-emerald-500' : 'border-transparent'}`}
              >
                <img src={t.url} alt="block" className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
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
                      transform: `rotate(${obj.rotation || 0}deg) scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1})`
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
                    <label className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer rounded-lg transition-colors font-medium text-xs">
                      <RefreshCw size={14} />
                      Replace All
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleReplaceImage(e, singleSelectedObj.templateId)} />
                    </label>
                  )}
                  <button onClick={() => { setPlacedObjects(prev => prev.filter(o => !selectedObjectIds.includes(o.id))); setSelectedObjectIds([]); }} className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg"><Trash2 size={16} /></button>
                  <button onClick={() => setSelectedObjectIds([])} className="p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg"><X size={16} /></button>
                </div>
              </div>
              {!isMultiSelected && singleSelectedObj && (
                <div className="flex items-center gap-2 mt-1 pt-3 border-t border-zinc-700">
                  <span className="text-xs text-zinc-400 font-medium">Apply to all of this type:</span>
                  <button onClick={() => {
                    setPlacedObjects(prev => prev.map(o => o.templateId === singleSelectedObj.templateId ? { ...o, w: singleSelectedObj.w, h: singleSelectedObj.h } : o));
                  }} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">Scale</button>
                  <button onClick={() => {
                    setPlacedObjects(prev => prev.map(o => o.templateId === singleSelectedObj.templateId ? { ...o, rotation: singleSelectedObj.rotation, flipX: singleSelectedObj.flipX, flipY: singleSelectedObj.flipY } : o));
                  }} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">Rotate/Flip</button>
                  <button onClick={() => {
                    setPlacedObjects(prev => prev.filter(o => o.templateId !== singleSelectedObj.templateId));
                    setSelectedObjectIds([]);
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
