import { useState, useCallback } from 'react';
import { Upload, Camera, Download, Loader, Edit3, Check, X } from 'lucide-react';

// Define a clear "shape" for our image object for TypeScript
interface ImageState {
  id: number;
  originalFile: File;
  originalName: string;
  base64: string;
  suggestedName: string;
  processing: boolean;
  processed: boolean;
}

const ImageRenamer = () => {
  // Use our new interface to tell TypeScript what's allowed in this array
  const [images, setImages] = useState<ImageState[]>([]);
  const [processing, setProcessing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    // Ensure files exist before processing
    if (!event.target.files) return;

    const files = Array.from(event.target.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    imageFiles.forEach((file: File) => {
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
          processed: false
        };
        setImages(prev => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const generateDescriptiveName = async (imageData: string, originalName: string) => {
    try {
      console.log('🔍 Starting image analysis for:', originalName);
      
      // Check if API key is available
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      console.log('🔑 API Key available:', !!apiKey);
      console.log('🔑 API Key starts with:', apiKey?.substring(0, 10) + '...');
      
      if (!apiKey) {
        throw new Error('VITE_ANTHROPIC_API_KEY environment variable is not set');
      }
      
      const base64Data = imageData.split(',')[1];
      const fileExtension = originalName.split('.').pop()?.toLowerCase() || 'jpeg';
      console.log('📁 File extension:', fileExtension);
      console.log('🖼️ Base64 data length:', base64Data.length);
      
      const requestBody = {
        model: "claude-4-opus-20250514",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`,
                  data: base64Data
                }
              },
              {
                type: "text",
                text: "Generate a descriptive filename for this image. The filename should be concise, lowercase, use underscores instead of spaces, and accurately describe the main subject and setting. Respond with only the filename, without the file extension."
              }
            ]
          }
        ]
      };
      
      console.log('📤 Making API request to Anthropic...');
      console.log('📋 Request model:', requestBody.model);
      
      const response = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📨 API response status:', response.status);
      console.log('📨 API response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API error response:', errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ API response data:', data);
      
      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('Invalid API response structure');
      }
      
      let suggestedName = data.content[0].text.trim();
      console.log('🏷️ Raw suggested name:', suggestedName);
      
      // Clean the suggested name
      suggestedName = suggestedName
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase()
        .substring(0, 50);
      
      const finalName = `${suggestedName}.${fileExtension}`;
      console.log('🎯 Final generated filename:', finalName);
      
      return finalName;
    } catch (error) {
      console.error('💥 Error generating descriptive name:', error);
      console.error('🔍 Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      const fallbackExtension = originalName.split('.').pop() || 'jpeg';
      const fallbackName = `processed_${Date.now()}.${fallbackExtension}`;
      console.log('🔄 Using fallback name:', fallbackName);
      return fallbackName;
    }
  };

  const processImage = async (imageId: number) => {
    setImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, processing: true } : img
    ));

    const image = images.find(img => img.id === imageId);
    if (!image) return;

    const suggestedName = await generateDescriptiveName(image.base64, image.originalName);

    setImages(prev => prev.map(img => 
      img.id === imageId 
        ? { ...img, suggestedName, processing: false, processed: true }
        : img
    ));
  };

  const processAllImages = async () => {
    setProcessing(true);
    const unprocessedImages = images.filter(img => !img.processed);
    
    for (const image of unprocessedImages) {
      await processImage(image.id);
    }
    
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
                        onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
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