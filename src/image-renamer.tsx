import React, { useState, useCallback } from 'react';
import { Upload, Camera, Download, Loader, Edit3, Check, X } from 'lucide-react';

const ImageRenamer = () => {
  const [images, setImages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingName, setEditingName] = useState('');

  const handleFileUpload = useCallback((event) => {
    const files = Array.from(event.target.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const newImage = {
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

  const generateDescriptiveName = async (imageData, originalName) => {
    try {
      const base64Data = imageData.split(',')[1];
      const fileExtension = originalName.split('.').pop().toLowerCase();
      
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-20241218",
          max_tokens: 200,
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
                  text: "Generate a descriptive filename for this image that would make it easy to find in an archive. Focus on accurately identifying the setting/location (restaurant, home, office, etc.) and the main subject matter. Look carefully at contextual clues like furniture, fixtures, and surrounding objects to determine the correct environment. The filename should be concise but descriptive, using underscores instead of spaces, and should capture the main subject, setting, and key elements. Respond with only the filename without the file extension."
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      let suggestedName = data.content[0].text.trim();
      
      // Clean up the suggested name
      suggestedName = suggestedName
        .replace(/[^a-zA-Z0-9_\-\s]/g, '') // Remove special characters except underscores, hyphens, and spaces
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .toLowerCase()
        .substring(0, 50); // Limit length
      
      return `${suggestedName}.${fileExtension}`;
    } catch (error) {
      console.error('Error generating descriptive name:', error);
      return `processed_${Date.now()}.${originalName.split('.').pop()}`;
    }
  };

  const processImage = async (imageId) => {
    setImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, processing: true } : img
    ));

    const image = images.find(img => img.id === imageId);
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

  const downloadImage = (image) => {
    const link = document.createElement('a');
    link.href = image.base64;
    link.download = image.suggestedName || image.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllImages = () => {
    images.forEach(image => {
      if (image.processed) {
        setTimeout(() => downloadImage(image), 100);
      }
    });
  };

  const startEditing = (index, currentName) => {
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

  const removeImage = (imageId) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">AI Image Renamer</h1>
        <p className="text-gray-600">Upload images and get descriptive filenames for better organization</p>
      </div>

      {/* Upload Area */}
      <div className="mb-6">
        <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-8 h-8 mb-4 text-gray-500" />
            <p className="mb-2 text-sm text-gray-500">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">PNG, JPG, GIF, WebP (MAX. 10MB each)</p>
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

      {/* Control Buttons */}
      {images.length > 0 && (
        <div className="flex gap-4 mb-6">
          <button
            onClick={processAllImages}
            disabled={processing || images.every(img => img.processed)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {processing ? 'Processing...' : 'Process All Images'}
          </button>
          
          <button
            onClick={downloadAllImages}
            disabled={!images.some(img => img.processed)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Download All Renamed
          </button>
        </div>
      )}

      {/* Images Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((image, index) => (
            <div key={image.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="relative">
                <img
                  src={image.base64}
                  alt={image.originalName}
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={() => removeImage(image.id)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-4">
                <div className="mb-2">
                  <p className="text-sm text-gray-500 mb-1">Original:</p>
                  <p className="text-sm font-medium truncate">{image.originalName}</p>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-1">New name:</p>
                  {editingIndex === index ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 text-sm px-2 py-1 border rounded"
                        onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                      />
                      <button
                        onClick={saveEdit}
                        className="p-1 text-green-600 hover:bg-green-100 rounded"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 text-red-600 hover:bg-red-100 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-blue-600 flex-1 truncate">
                        {image.processing ? (
                          <span className="flex items-center gap-2">
                            <Loader className="w-4 h-4 animate-spin" />
                            Analyzing...
                          </span>
                        ) : image.processed ? (
                          image.suggestedName
                        ) : (
                          <span className="text-gray-400">Click "Process" to generate</span>
                        )}
                      </p>
                      {image.processed && (
                        <button
                          onClick={() => startEditing(index, image.suggestedName)}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {!image.processed && !image.processing && (
                    <button
                      onClick={() => processImage(image.id)}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Process
                    </button>
                  )}
                  
                  {image.processed && (
                    <button
                      onClick={() => downloadImage(image)}
                      className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <div className="text-center py-12">
          <Camera className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Upload images to get started</p>
        </div>
      )}
    </div>
  );
};

export default ImageRenamer;