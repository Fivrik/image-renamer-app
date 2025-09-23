import { useState, useCallback } from 'react';
import { Upload, Camera, Download, Loader, Edit3, Check, X, Users } from 'lucide-react';
import exifr from 'exifr';
import peopleDetectionService, { type DetectedPerson } from './services/peopleDetectionService';
import embeddedTagsService, { type EmbeddedPerson } from './services/embeddedTagsService';

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
  detectedPeople?: DetectedPerson[];
  peopleProcessing?: boolean;
  embeddedPeople?: EmbeddedPerson[];
  hasEmbeddedTags?: boolean;
  tagProcessing?: boolean;
  taggingSoftware?: string;
}

const ImageRenamer = () => {
  // Use our new interface to tell TypeScript what's allowed in this array
  const [images, setImages] = useState<ImageState[]>([]);
  const [processing, setProcessing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'info' | 'error' | 'success' }>>([]);
  const [showPeopleManager, setShowPeopleManager] = useState(false);
  const [knownPeople, setKnownPeople] = useState(peopleDetectionService.getKnownPeople());
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonDescription, setNewPersonDescription] = useState('');

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

    // STEP 1: Extract embedded people tags first (highest priority)
    let embeddedPeople: EmbeddedPerson[] = [];
    let hasEmbeddedTags = false;
    let taggingSoftware: string | undefined;

    try {
      setImages(prev => prev.map(img =>
        img.id === imageId ? { ...img, tagProcessing: true } : img
      ));

      const tagResult = await embeddedTagsService.extractPeopleTags(image.originalFile);
      embeddedPeople = tagResult.people;
      hasEmbeddedTags = tagResult.hasEmbeddedTags;
      taggingSoftware = tagResult.metadata?.software;

      setImages(prev => prev.map(img =>
        img.id === imageId ? {
          ...img,
          embeddedPeople,
          hasEmbeddedTags,
          taggingSoftware,
          tagProcessing: false
        } : img
      ));

      if (embeddedPeople.length > 0) {
        const peopleNames = embeddedPeople.map(p => p.name).join(', ');
        console.log(`📌 Found embedded people tags: ${peopleNames}`);
        showToast(`Found tagged people: ${peopleNames}`, 'success');
      } else {
        console.log('📭 No embedded people tags found');
      }
    } catch (error) {
      console.error('❌ Error extracting embedded tags:', error);
      setImages(prev => prev.map(img =>
        img.id === imageId ? { ...img, tagProcessing: false } : img
      ));
    }

    // STEP 2: Use Claude AI for people detection only if no embedded tags
    let detectedPeople: DetectedPerson[] = [];
    if (embeddedPeople.length === 0) {
      console.log('🤖 No embedded people tags found, using Claude AI detection...');
      try {
        setImages(prev => prev.map(img =>
          img.id === imageId ? { ...img, peopleProcessing: true } : img
        ));

        detectedPeople = await peopleDetectionService.detectPeopleInImage(
          image.base64,
          image.originalName
        );

        setImages(prev => prev.map(img =>
          img.id === imageId ? { ...img, detectedPeople, peopleProcessing: false } : img
        ));

        if (detectedPeople.length > 0) {
          const peopleNames = detectedPeople.map(p => p.name).join(', ');
          console.log(`🤖 Claude AI detected people: ${peopleNames}`);
        }
      } catch (error) {
        console.error('❌ Error with Claude AI detection:', error);
        setImages(prev => prev.map(img =>
          img.id === imageId ? { ...img, peopleProcessing: false } : img
        ));
      }
    } else {
      console.log('✅ Using embedded people tags, skipping Claude AI detection');
    }

    // STEP 3: Generate AI description
    let suggestedName = await generateDescriptiveName(image.base64, image.originalName);

    // STEP 4: Build enhanced filename
    if (suggestedName) {
      const lastDotIndex = suggestedName.lastIndexOf('.');
      let nameWithoutExt = suggestedName;
      let extension = '';

      if (lastDotIndex > -1) {
        nameWithoutExt = suggestedName.substring(0, lastDotIndex);
        extension = suggestedName.substring(lastDotIndex);
      }

      const parts = [];

      // Add date first if available
      if (image.photoDate) {
        parts.push(image.photoDate);
        console.log('📅 Added date to filename');
      }

      // Add people names (prioritize embedded tags over AI detection)
      let peopleNames: string[] = [];
      if (embeddedPeople.length > 0) {
        // Use embedded people tags (highest priority)
        peopleNames = embeddedPeople.map(person =>
          person.name.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
        ).filter(name => name.length > 0);

        if (peopleNames.length > 0) {
          console.log(`📌 Using embedded people tags in filename: ${peopleNames.join(', ')}`);
        }
      } else if (detectedPeople.length > 0) {
        // Fallback to Claude AI detection
        peopleNames = detectedPeople
          .filter(person => person.confidence === 'high' || person.confidence === 'medium')
          .map(person => person.name.toLowerCase().replace(/\s+/g, '_'));

        if (peopleNames.length > 0) {
          console.log(`🤖 Using Claude AI detected people in filename: ${peopleNames.join(', ')}`);
        }
      }

      if (peopleNames.length > 0) {
        parts.push(peopleNames.join('_and_'));
      }

      // Add AI description
      parts.push(nameWithoutExt);

      // Combine all parts
      suggestedName = parts.join('_') + extension;
      console.log('🎯 Final filename:', suggestedName);
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

  // People management functions
  const addNewPerson = () => {
    if (!newPersonName.trim() || !newPersonDescription.trim()) {
      showToast('Please provide both name and description', 'error');
      return;
    }

    try {
      peopleDetectionService.addKnownPerson({
        name: newPersonName.trim(),
        description: newPersonDescription.trim(),
      });

      setKnownPeople(peopleDetectionService.getKnownPeople());
      setNewPersonName('');
      setNewPersonDescription('');
      showToast(`Added ${newPersonName} to known people`, 'success');
    } catch (error) {
      showToast('Failed to add person', 'error');
    }
  };

  const removePerson = (personId: string) => {
    try {
      peopleDetectionService.removePerson(personId);
      setKnownPeople(peopleDetectionService.getKnownPeople());
      showToast('Person removed successfully', 'success');
    } catch (error) {
      showToast('Failed to remove person', 'error');
    }
  };

  const clearAllPeople = () => {
    peopleDetectionService.clearAllPeople();
    setKnownPeople([]);
    showToast('All people cleared', 'success');
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

        {/* Helpful reminder about people tagging */}
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-2xl mx-auto">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <h3 className="font-semibold text-blue-800 text-sm">💡 Pro Tip: Tag People First!</h3>
              <p className="text-blue-700 text-sm mt-1">
                For best results, tag people in your photos using <strong>Windows Photo Gallery</strong> or similar software before uploading.
                The app will use your exact tags and fall back to AI detection for untagged photos.
              </p>
              <p className="text-blue-600 text-xs mt-2">
                ✅ Tagged photos → Uses your names &nbsp;|&nbsp; 🤖 Untagged photos → Uses AI detection
              </p>
            </div>
          </div>
        </div>
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

          <button
            onClick={() => setShowPeopleManager(true)}
            className="flex items-center gap-2 px-4 py-2 font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Users className="w-5 h-5" />
            Manage People ({knownPeople.length})
          </button>
        </div>
      )}

      {/* People Manager Modal */}
      {showPeopleManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Users className="w-6 h-6" />
                  Manage Known People
                </h2>
                <button
                  onClick={() => setShowPeopleManager(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-600 mt-2">Add people you want the AI to recognize in your photos. Provide a detailed description to help with identification.</p>
            </div>

            <div className="p-6 overflow-y-auto max-h-96">
              {/* Add New Person Form */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3">Add New Person</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={newPersonName}
                      onChange={(e) => setNewPersonName(e.target.value)}
                      placeholder="e.g., Mom, John Smith, Sarah"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={newPersonDescription}
                      onChange={(e) => setNewPersonDescription(e.target.value)}
                      placeholder="e.g., Middle-aged woman with brown hair and glasses, usually wearing colorful shirts"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      rows={2}
                    />
                  </div>
                  <button
                    onClick={addNewPerson}
                    disabled={!newPersonName.trim() || !newPersonDescription.trim()}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Add Person
                  </button>
                </div>
              </div>

              {/* Known People List */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">Known People ({knownPeople.length})</h3>
                  {knownPeople.length > 0 && (
                    <button
                      onClick={clearAllPeople}
                      className="text-sm text-red-600 hover:text-red-700 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {knownPeople.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No people added yet. Add someone above to get started!</p>
                ) : (
                  <div className="space-y-3">
                    {knownPeople.map((person) => (
                      <div key={person.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-800">{person.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{person.description}</p>
                            {person.aliases && person.aliases.length > 0 && (
                              <p className="text-xs text-purple-600 mt-1">
                                Also known as: {person.aliases.join(', ')}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removePerson(person.id)}
                            className="ml-3 p-1 text-red-600 hover:text-red-700 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
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

                  {/* Processing indicators */}
                  {image.tagProcessing && (
                    <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                      <Loader className="w-3 h-3 animate-spin" />
                      Reading embedded tags...
                    </p>
                  )}
                  {image.peopleProcessing && (
                    <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                      <Loader className="w-3 h-3 animate-spin" />
                      AI detecting people...
                    </p>
                  )}

                  {/* Embedded people tags (highest priority) */}
                  {image.embeddedPeople && image.embeddedPeople.length > 0 && (
                    <div className="text-xs text-green-600 mt-1">
                      <p className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Tagged: {image.embeddedPeople.map(p => p.name).join(', ')}
                      </p>
                      <p className="text-gray-500 text-xs">
                        From {image.embeddedPeople[0].source === 'windows_gallery' ? 'Windows Photo Gallery' :
                             image.embeddedPeople[0].source === 'adobe_bridge' ? 'Adobe software' : 'embedded metadata'}
                        {image.taggingSoftware && ` (${image.taggingSoftware})`}
                      </p>
                    </div>
                  )}

                  {/* AI detected people (fallback when no embedded tags) */}
                  {(!image.embeddedPeople || image.embeddedPeople.length === 0) &&
                   image.detectedPeople && image.detectedPeople.length > 0 && (
                    <div className="text-xs text-purple-600 mt-1">
                      <p className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        AI Detected: {image.detectedPeople.map(p => p.name).join(', ')}
                      </p>
                      <p className="text-gray-500 text-xs">From Claude AI analysis</p>
                    </div>
                  )}

                  {/* No people found */}
                  {!image.tagProcessing && !image.peopleProcessing &&
                   (!image.embeddedPeople || image.embeddedPeople.length === 0) &&
                   (!image.detectedPeople || image.detectedPeople.length === 0) &&
                   image.processed && (
                    <p className="text-xs text-gray-500 mt-1">👤 No people found</p>
                  )}

                  {/* Show when embedded tags found but no people tagged */}
                  {image.hasEmbeddedTags === false && !image.tagProcessing && image.processed && (
                    <div className="text-xs text-blue-600 mt-1 p-2 bg-blue-50 rounded border">
                      <p className="font-medium">📭 No people tags found</p>
                      <p className="text-blue-500">Tip: Tag people in Windows Photo Gallery first for better results!</p>
                    </div>
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
