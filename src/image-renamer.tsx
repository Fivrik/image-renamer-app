import { useState, useCallback } from 'react';
import { Upload, Camera, Download, Loader, Edit3, Check, X } from 'lucide-react';
import exifr from 'exifr';

// Define a clear "shape" for our image object for TypeScript
interface ImageState {
  id: number;
  originalFile: File;
  originalName: string;
  base64: string;
  suggestedName: string;
  processing: boolean;
  processed: boolean;
  photoDate?: string;
  isAlreadyRenamed?: boolean;
}

const ImageRenamer = () => {
  // Use our new interface to tell TypeScript what's allowed in this array
  const [images, setImages] = useState<ImageState[]>([]);
  const [processing, setProcessing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'info' | 'error' | 'success' }>>([]);

  const showToast = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Check if a filename appears to be already AI-renamed
  const checkIfAlreadyRenamed = (filename: string): boolean => {
    // Check for patterns that suggest AI renaming:
    // - Multiple underscores
    // - Descriptive words common in AI descriptions
    // - Date patterns like YYYY-MM-DD or YYYYMMDD
    const aiPatterns = [
      /_\d{4}[-_]\d{2}[-_]\d{2}/, // Date pattern YYYY-MM-DD or YYYY_MM_DD
      /_\d{8}[-_]/, // Date pattern YYYYMMDD
      /^[a-z]+_[a-z]+_[a-z]+/i, // Multiple words separated by underscores
      /sunset|sunrise|landscape|portrait|selfie|group|beach|mountain|city|nature|food|pet|dog|cat/i
    ];

    // If filename has 3+ underscores and descriptive words, it's likely renamed
    const underscoreCount = (filename.match(/_/g) || []).length;
    const hasDescriptiveWords = aiPatterns.some(pattern => pattern.test(filename));

    return underscoreCount >= 2 && hasDescriptiveWords;
  };

  // Format date for filename (YYYY-MM-DD)
  const formatDateForFilename = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}_${month}_${day}`;
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    // Ensure files exist before processing
    if (!event.target.files) return;

    const files = Array.from(event.target.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    imageFiles.forEach(async (file: File) => {
      // Check if file is already renamed
      const isAlreadyRenamed = checkIfAlreadyRenamed(file.name);

      // Try to get EXIF date from the image
      let photoDate = '';
      try {
        const exifData = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
        if (exifData) {
          // Try different date fields in order of preference
          const dateValue = exifData.DateTimeOriginal || exifData.CreateDate || exifData.ModifyDate;
          if (dateValue) {
            photoDate = formatDateForFilename(new Date(dateValue));
            console.log('📅 EXIF date found:', photoDate);
          }
        }
      } catch (error) {
        console.log('⚠️ Could not read EXIF data:', error);
      }

      // Fallback to file modification date if no EXIF date
      if (!photoDate) {
        photoDate = formatDateForFilename(new Date(file.lastModified));
        console.log('📅 Using file date as fallback:', photoDate);
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        // Ensure the result exists and is a string
        if (!e.target || typeof e.target.result !== 'string') return;

        const newImage: ImageState = {
          id: Date.now() + Math.random(),
          originalFile: file,
          originalName: file.name,
          base64: e.target.result,
          suggestedName: '',
          processing: false,
          processed: false,
          photoDate,
          isAlreadyRenamed
        };

        // If already renamed, show a notification
        if (isAlreadyRenamed) {
          showToast(`"${file.name}" appears to be already renamed`, 'info');
        }

        setImages(prev => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });
  }, [checkIfAlreadyRenamed, showToast]);

  const generateDescriptiveName = async (imageData: string, originalName: string) => {
    try {
      console.log('🔍 Starting image analysis for:', originalName);
      
      console.log('📤 Making API request to backend...');
      
      const response = await fetch("/api/analyze-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          imageData,
          originalName
        })
      });

      console.log('📨 API response status:', response.status);

      if (!response.ok) {
        let errorMessage = `API request failed: ${response.status}`;
        // Clone the response so we can read it multiple times if needed
        const responseClone = response.clone();
        
        try {
          const errorData = await responseClone.json();
          console.error('❌ API error response:', errorData);
          errorMessage += ` - ${errorData.error}`;
        } catch (jsonError) {
          // If JSON parsing fails, try to get text from the original response
          try {
            const errorText = await response.text();
            console.error('❌ API error response (raw):', errorText);
            errorMessage += ` - ${errorText.substring(0, 200)}`;
          } catch (textError) {
            console.error('❌ Failed to read error response:', textError);
            // Don't modify the error message if we can't read the response
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('✅ API response data:', data);
      
      if (!data.suggestedName) {
        throw new Error('Invalid API response: missing suggestedName');
      }
      
      console.log('🎯 Final generated filename:', data.suggestedName);
      
      return data.suggestedName;
    } catch (error) {
      console.error('💥 Error generating descriptive name:', error);
      console.error('🔍 Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : 'Unknown'
      });
      // Notify user on failure
      showToast('Failed to generate AI name. Using fallback.', 'error');
      
      const fallbackExtension = originalName.split('.').pop() || 'jpeg';
      const fallbackName = `processed_${Date.now()}.${fallbackExtension}`;
      console.log('🔄 Using fallback name:', fallbackName);
      return fallbackName;
    }
  };

  const processImage = useCallback(async (imageId: number) => {
    const image = images.find(img => img.id === imageId);
    if (!image) return;

    // Skip processing if already renamed
    if (image.isAlreadyRenamed) {
      showToast(`Skipping "${image.originalName}" - already renamed`, 'info');
      setImages(prev => prev.map(img =>
        img.id === imageId
          ? { ...img, suggestedName: image.originalName, processing: false, processed: true }
          : img
      ));
      return;
    }

    setImages(prev => prev.map(img =>
      img.id === imageId ? { ...img, processing: true } : img
    ));

    let suggestedName = await generateDescriptiveName(image.base64, image.originalName);

    // Add date to the filename if we have it
    if (image.photoDate && suggestedName) {
      // Get the file extension
      const lastDotIndex = suggestedName.lastIndexOf('.');
      let nameWithoutExt = suggestedName;
      let extension = '';

      if (lastDotIndex > -1) {
        nameWithoutExt = suggestedName.substring(0, lastDotIndex);
        extension = suggestedName.substring(lastDotIndex);
      }

      // Add date at the beginning of the filename
      suggestedName = `${image.photoDate}_${nameWithoutExt}${extension}`;
      console.log('📅 Added date to filename:', suggestedName);
    }

    setImages(prev => prev.map(img =>
      img.id === imageId
        ? { ...img, suggestedName, processing: false, processed: true }
        : img
    ));
  }, [images, showToast]);

  const processAllImages = async () => {
    setProcessing(true);
    const ids = images.filter((img) => !img.processed).map((img) => img.id);

    const CONCURRENCY_LIMIT = 3;
    let index = 0;
    const workers = new Array(Math.min(CONCURRENCY_LIMIT, ids.length)).fill(0).map(async () => {
      while (true) {
        const i = index++;
        if (i >= ids.length) break;
        await processImage(ids[i]);
      }
    });

    await Promise.all(workers);
    setProcessing(false);
  };

  const downloadImage = (image: ImageState) => {
    const link = document.createElement('a');
    link.href = image.base64;
    link.download = image.suggestedName || image.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllImages = () => {
    const processedImages = images.filter(img => img.processed);
    processedImages.forEach((image, index) => {
      setTimeout(() => downloadImage(image), index * 100);
    });
  };

  const startEditing = (index: number, currentName: string) => {
    setEditingIndex(index);
    setEditingName(currentName);
  };

  const saveEdit = () => {
    if (editingIndex !== null) {
      setImages(prev => prev.map((img, idx) => 
        idx === editingIndex ? { ...img, suggestedName: editingName } : img
      ));
      setEditingIndex(null);
      setEditingName('');
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingName('');
  };

  const removeImage = (imageId: number) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen font-sans">
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded shadow text-white flex items-center gap-3 min-w-[260px] ${
              t.type === 'error' ? 'bg-red-600' : t.type === 'success' ? 'bg-green-600' : 'bg-gray-800'
            }`}
            role="status"
            aria-live="polite"
          >
            <span className="text-sm font-medium flex-1">{t.message}</span>
            <button
              aria-label="Close notification"
              className="p-1 rounded hover:bg-white/20 transition-colors"
              onClick={() => dismissToast(t.id)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">AI Image Renamer</h1>
        <p className="text-gray-600 text-lg">Upload images and get descriptive filenames powered by AI.</p>
      </div>

      <div className="mb-6">
        <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-100 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-10 h-10 mb-4 text-gray-500" />
            <p className="mb-2 text-md text-gray-500">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">PNG, JPG, GIF, WebP</p>
          </div>
          <input
            type="file"
            className="hidden"
            multiple
            accept="image/*"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-6">
          <button
            onClick={processAllImages}
            disabled={processing || images.every(img => img.processed)}
            className="flex items-center gap-2 px-4 py-2 font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? <Loader className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            {processing ? 'Processing...' : `Process All (${images.filter(i => !i.processed).length})`}
          </button>
          
          <button
            onClick={downloadAllImages}
            disabled={!images.some(img => img.processed)}
            className="flex items-center gap-2 px-4 py-2 font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-5 h-5" />
            Download All Renamed
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map((image, index) => (
            <div key={image.id} className="bg-white border rounded-lg shadow-md overflow-hidden flex flex-col">
              <div className="relative">
                <img
                  src={image.base64}
                  alt={image.originalName}
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={() => removeImage(image.id)}
                  aria-label="Remove image"
                  className="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-4 flex flex-col flex-grow">
                <div className="mb-2 flex-grow">
                  <p className="text-xs text-gray-500 mb-1">Original:</p>
                  <p className="text-sm font-medium text-gray-700 truncate" title={image.originalName}>{image.originalName}</p>
                  {image.photoDate && (
                    <p className="text-xs text-blue-600 mt-1">📅 Photo taken: {image.photoDate}</p>
                  )}
                  {image.isAlreadyRenamed && (
                    <p className="text-xs text-green-600 mt-1">✅ Already renamed</p>
                  )}
                </div>
                
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">New name:</p>
                  {editingIndex === index ? (
                    <div className="flex gap-1 items-center">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 text-sm px-2 py-1 border border-blue-500 rounded ring-2 ring-blue-200"
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        autoFocus
                      />
                      <button onClick={saveEdit} aria-label="Save name" className="p-1.5 text-green-600 hover:bg-green-100 rounded"><Check className="w-5 h-5" /></button>
                      <button onClick={cancelEdit} aria-label="Cancel edit" className="p-1.5 text-red-600 hover:bg-red-100 rounded"><X className="w-5 h-5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <p className="text-sm font-semibold text-blue-700 flex-1 truncate" title={image.suggestedName}>
                        {image.processing ? (
                          <span className="flex items-center gap-2 text-gray-500"><Loader className="w-4 h-4 animate-spin" />Analyzing...</span>
                        ) : image.processed ? (
                          image.suggestedName
                        ) : (
                          <span className="text-gray-400 font-normal">Ready to process</span>
                        )}
                      </p>
                      {image.processed && (
                        <button onClick={() => startEditing(index, image.suggestedName)} aria-label="Edit name" className="p-1.5 text-gray-500 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"><Edit3 className="w-4 h-4" /></button>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2 mt-auto">
                  {!image.processed && !image.processing && (
                    <button onClick={() => processImage(image.id)} className="w-full px-3 py-2 text-sm font-bold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">Process</button>
                  )}
                  {image.processed && (
                    <button onClick={() => downloadImage(image)} className="w-full px-3 py-2 text-sm font-bold bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-2"><Download className="w-4 h-4" />Download</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <div className="text-center py-20">
          <Camera className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600">Upload Your Images</h3>
          <p className="text-gray-500">Drag and drop or click above to begin.</p>
        </div>
      )}
    </div>
  );
};

export default ImageRenamer;
