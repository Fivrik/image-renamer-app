# Extracting Existing People Tags from Your Mom's Photos

## 🎯 Executive Summary

**Great News!** Your request to work with people your mom has already tagged is **much more achievable** than automatic face detection. Here's why this approach will work:

### ✅ What's Possible
- **Windows Photo Gallery Tags**: People tags are stored as XMP metadata in photo files
- **EXIF/XMP Extraction**: Your app already uses `exifr` library which supports XMP
- **Embedded Metadata**: Tags are stored directly in photo files, not in cloud APIs
- **Offline Processing**: Works without internet connection to cloud services

### ❌ Cloud API Limitations Confirmed
- **OneDrive**: No API access to people tags (even though they exist in the web interface)
- **Google Photos**: No API access to face groups or people tags
- **Privacy by Design**: Cloud providers intentionally exclude this data from APIs

## 📋 Research Findings

### OneDrive People Tags
- Tags visible in OneDrive web interface (`photos.onedrive.com/explore/things`)
- **NOT accessible** via Microsoft Graph API
- Search API no longer returns results based on "tags" metadata

### Google Photos People Tags
- Manual and automatic face tagging available in Google Photos UI
- **NOT accessible** via Google Photos API (even for manually tagged people)
- API restrictions increased in 2025

### Embedded Metadata Solution
- **Windows Photo Gallery**: Stores people tags as XMP metadata using Microsoft People Tag Schema
- **XMP Standard**: Extensible Metadata Platform with embedded people information
- **JavaScript Libraries**: `exifr` and `ExifReader` can extract XMP data

## 🏗️ Implementation Architecture

### Current App Enhancement Strategy
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Photo Upload  │    │   Metadata       │    │   Enhanced      │
│                 │    │   Extraction     │    │   Filename      │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │   Local     │ │───▶│ │   exifr      │ │───▶│ │   Date +    │ │
│ │   Files     │ │    │ │   XMP Tags   │ │    │ │   People +  │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ │   AI Desc   │ │
│                 │    │        │         │    │ └─────────────┘ │
│ ┌─────────────┐ │    │        ▼         │    │                 │
│ │  Cloud      │ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │  Downloads  │ │    │ │  Parse       │ │    │ │  Fallback   │ │
│ └─────────────┘ │    │ │  People XML  │ │    │ │  Claude AI  │ │
└─────────────────┘    │ └──────────────┘ │    │ └─────────────┘ │
                       └──────────────────┘    └─────────────────┘
```

### Enhanced Workflow
1. **Upload Photo** → Your mom uploads or selects photos
2. **Extract EXIF/XMP** → App reads embedded metadata using `exifr`
3. **Parse People Tags** → Extract Microsoft People Tags from XMP
4. **Generate Filename** → Combine date + existing people tags + AI description
5. **Fallback to AI** → Use Claude AI only if no existing people tags found

## 🛠️ Technical Implementation

### 1. Enhanced People Detection Service

```typescript
// src/services/embeddedTagsService.ts
import exifr from 'exifr';

export interface EmbeddedPerson {
  name: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  source: 'windows_gallery' | 'adobe_bridge' | 'other_xmp';
}

export class EmbeddedTagsService {

  // Extract people tags from photo metadata
  async extractPeopleTags(imageFile: File): Promise<EmbeddedPerson[]> {
    try {
      console.log('🔍 Extracting embedded people tags...');

      // Enable XMP parsing in exifr
      const metadata = await exifr.parse(imageFile, {
        xmp: true,        // Enable XMP extraction
        tiff: true,       // Enable TIFF/EXIF
        icc: false,       // Disable ICC (not needed)
        iptc: false,      // Disable IPTC (not needed)
        jfif: false       // Disable JFIF (not needed)
      });

      if (!metadata || !metadata.xmp) {
        console.log('📭 No XMP metadata found');
        return [];
      }

      // Parse Microsoft People Tags from XMP
      const peopleTags = this.parseMicrosoftPeopleTags(metadata.xmp);

      if (peopleTags.length > 0) {
        console.log(`👥 Found ${peopleTags.length} embedded people tags:`,
          peopleTags.map(p => p.name).join(', '));
      }

      return peopleTags;
    } catch (error) {
      console.error('❌ Error extracting people tags:', error);
      return [];
    }
  }

  // Parse Microsoft People Tag Schema from XMP XML
  private parseMicrosoftPeopleTags(xmpString: string): EmbeddedPerson[] {
    const people: EmbeddedPerson[] = [];

    try {
      // Microsoft People Tag Schema namespace
      // https://ns.microsoft.com/photo/1.2/

      // Look for MP:RegionInfo in XMP
      const regionInfoMatch = xmpString.match(/<MP:RegionInfo[^>]*>(.*?)<\/MP:RegionInfo>/s);
      if (!regionInfoMatch) {
        return people;
      }

      // Extract individual regions
      const regionsMatch = xmpString.match(/<MP:Regions[^>]*>(.*?)<\/MP:Regions>/s);
      if (!regionsMatch) {
        return people;
      }

      // Parse each person region
      const personRegions = regionsMatch[1].match(/<rdf:li[^>]*>(.*?)<\/rdf:li>/gs);
      if (!personRegions) {
        return people;
      }

      for (const region of personRegions) {
        const personName = this.extractPersonName(region);
        const boundingBox = this.extractBoundingBox(region);

        if (personName) {
          people.push({
            name: personName,
            boundingBox,
            source: 'windows_gallery'
          });
        }
      }

    } catch (error) {
      console.error('❌ Error parsing Microsoft People Tags:', error);
    }

    return people;
  }

  // Extract person name from region XML
  private extractPersonName(regionXml: string): string | null {
    // Look for MP:PersonDisplayName
    const nameMatch = regionXml.match(/<MP:PersonDisplayName[^>]*>([^<]+)<\/MP:PersonDisplayName>/);
    if (nameMatch) {
      return nameMatch[1].trim();
    }

    // Fallback: look for other name fields
    const altNameMatch = regionXml.match(/<MP:Name[^>]*>([^<]+)<\/MP:Name>/);
    if (altNameMatch) {
      return altNameMatch[1].trim();
    }

    return null;
  }

  // Extract bounding box coordinates
  private extractBoundingBox(regionXml: string): EmbeddedPerson['boundingBox'] {
    try {
      const rectMatch = regionXml.match(/<MP:Rectangle[^>]*>([^<]+)<\/MP:Rectangle>/);
      if (!rectMatch) return undefined;

      // Format: "x, y, width, height" (normalized 0-1)
      const coords = rectMatch[1].split(',').map(n => parseFloat(n.trim()));
      if (coords.length === 4) {
        return {
          x: coords[0],
          y: coords[1],
          width: coords[2],
          height: coords[3]
        };
      }
    } catch (error) {
      console.error('❌ Error parsing bounding box:', error);
    }

    return undefined;
  }

  // Check if photo has any embedded people tags
  async hasPeopleTags(imageFile: File): Promise<boolean> {
    const tags = await this.extractPeopleTags(imageFile);
    return tags.length > 0;
  }

  // Get people names formatted for filenames
  async getPeopleNamesForFilename(imageFile: File): Promise<string[]> {
    const tags = await this.extractPeopleTags(imageFile);
    return tags.map(person =>
      person.name.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
    );
  }
}

export const embeddedTagsService = new EmbeddedTagsService();
```

### 2. Enhanced Image Processing Integration

```typescript
// Update src/image-renamer.tsx
import { embeddedTagsService, type EmbeddedPerson } from './services/embeddedTagsService';

// Add to ImageState interface
interface ImageState {
  // ... existing properties
  embeddedPeople?: EmbeddedPerson[];
  hasEmbeddedTags?: boolean;
  tagProcessing?: boolean;
}

// Enhanced processImage function
const processImage = useCallback(async (imageId: number) => {
  const image = images.find(img => img.id === imageId);
  if (!image) return;

  setImages(prev => prev.map(img =>
    img.id === imageId ? { ...img, processing: true, tagProcessing: true } : img
  ));

  // STEP 1: Extract embedded people tags first
  let embeddedPeople: EmbeddedPerson[] = [];
  try {
    embeddedPeople = await embeddedTagsService.extractPeopleTags(image.originalFile);

    setImages(prev => prev.map(img =>
      img.id === imageId ? {
        ...img,
        embeddedPeople,
        hasEmbeddedTags: embeddedPeople.length > 0,
        tagProcessing: false
      } : img
    ));

    if (embeddedPeople.length > 0) {
      const peopleNames = embeddedPeople.map(p => p.name).join(', ');
      console.log(`👥 Found embedded people tags: ${peopleNames}`);
      showToast(`Found people tags: ${peopleNames}`, 'success');
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
    } catch (error) {
      console.error('❌ Error with Claude AI detection:', error);
    }
  }

  // STEP 3: Generate AI description
  let suggestedName = await generateDescriptiveName(image.base64, image.originalName);

  // STEP 4: Build enhanced filename
  if (suggestedName) {
    const parts = [];

    // Add date
    if (image.photoDate) {
      parts.push(image.photoDate);
    }

    // Add people names (prioritize embedded tags)
    let peopleNames: string[] = [];
    if (embeddedPeople.length > 0) {
      // Use embedded people tags
      peopleNames = embeddedPeople.map(person =>
        person.name.toLowerCase().replace(/\s+/g, '_')
      );
      console.log(`📌 Using embedded people tags in filename: ${peopleNames.join(', ')}`);
    } else if (detectedPeople.length > 0) {
      // Fallback to Claude AI detection
      peopleNames = detectedPeople
        .filter(person => person.confidence === 'high' || person.confidence === 'medium')
        .map(person => person.name.toLowerCase().replace(/\s+/g, '_'));
      console.log(`🤖 Using Claude AI detected people in filename: ${peopleNames.join(', ')}`);
    }

    if (peopleNames.length > 0) {
      parts.push(peopleNames.join('_and_'));
    }

    // Add AI description
    const nameWithoutExt = suggestedName.substring(0, suggestedName.lastIndexOf('.'));
    const extension = suggestedName.substring(suggestedName.lastIndexOf('.'));
    parts.push(nameWithoutExt);

    suggestedName = parts.join('_') + extension;
  }

  setImages(prev => prev.map(img =>
    img.id === imageId ? { ...img, suggestedName, processing: false, processed: true } : img
  ));
}, [images, showToast]);
```

### 3. Enhanced UI to Show Embedded Tags

```typescript
// Update image card display in src/image-renamer.tsx
{image.tagProcessing && (
  <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
    <Loader className="w-3 h-3 animate-spin" />
    Reading embedded tags...
  </p>
)}

{image.embeddedPeople && image.embeddedPeople.length > 0 && (
  <div className="text-xs text-green-600 mt-1">
    <p className="flex items-center gap-1">
      <Users className="w-3 h-3" />
      Tagged: {image.embeddedPeople.map(p => p.name).join(', ')}
    </p>
    <p className="text-gray-500 text-xs">From embedded metadata</p>
  </div>
)}

{image.hasEmbeddedTags === false && image.detectedPeople && image.detectedPeople.length > 0 && (
  <div className="text-xs text-purple-600 mt-1">
    <p className="flex items-center gap-1">
      <Users className="w-3 h-3" />
      AI Detected: {image.detectedPeople.map(p => p.name).join(', ')}
    </p>
    <p className="text-gray-500 text-xs">From Claude AI</p>
  </div>
)}

{!image.tagProcessing && !image.peopleProcessing &&
 (!image.embeddedPeople || image.embeddedPeople.length === 0) &&
 (!image.detectedPeople || image.detectedPeople.length === 0) &&
 image.processed && (
  <p className="text-xs text-gray-500 mt-1">👤 No people found</p>
)}
```

### 4. Package.json Dependencies

```json
{
  "dependencies": {
    // ... existing dependencies
    "exifr": "^7.1.3"  // Already installed - just need to enable XMP
  }
}
```

## 🧪 Testing Strategy

### Phase 1: Metadata Extraction Testing
```javascript
// Test embedded tag extraction
describe('Embedded Tags Service', () => {
  test('extracts Microsoft People Tags from XMP', async () => {
    const mockFile = new File([...], 'test-photo.jpg');
    const people = await embeddedTagsService.extractPeopleTags(mockFile);
    expect(people).toEqual([
      { name: 'Mom', source: 'windows_gallery' },
      { name: 'Sarah', source: 'windows_gallery' }
    ]);
  });

  test('handles photos without people tags', async () => {
    const mockFile = new File([...], 'landscape.jpg');
    const people = await embeddedTagsService.extractPeopleTags(mockFile);
    expect(people).toEqual([]);
  });
});
```

### Phase 2: Integration Testing
```javascript
// Test filename generation with embedded tags
describe('Enhanced Image Processing', () => {
  test('uses embedded people tags in filename', async () => {
    const mockImage = {
      originalFile: mockFileWithPeopleTags,
      photoDate: '2024_03_15'
    };

    const result = await processImage(mockImage);
    expect(result.suggestedName).toMatch(/2024_03_15_mom_and_sarah_.*\.jpg/);
  });

  test('falls back to Claude AI when no embedded tags', async () => {
    const mockImage = {
      originalFile: mockFileWithoutPeopleTags,
      photoDate: '2024_03_15'
    };

    const result = await processImage(mockImage);
    // Should use Claude AI detection
  });
});
```

## 📝 Sample Usage

### Example 1: Photo with Embedded People Tags
```
Input: Mom's photo with Windows Photo Gallery people tags
Embedded Tags: "Mom", "Sarah", "Uncle John"
Photo Date: March 15, 2024
AI Description: "birthday_party_with_cake"

Output Filename: "2024_03_15_mom_and_sarah_and_uncle_john_birthday_party_with_cake.jpg"
```

### Example 2: Photo without Embedded Tags
```
Input: Mom's photo without people tags
Embedded Tags: (none)
Photo Date: March 15, 2024
AI Description: "family_gathering_in_garden"
Claude AI Detection: "adult_woman", "young_girl"

Output Filename: "2024_03_15_adult_woman_and_young_girl_family_gathering_in_garden.jpg"
```

## 🚀 Deployment Plan

### Phase 1: Core Implementation (Week 1)
1. ✅ Update `exifr` configuration to enable XMP parsing
2. ✅ Create `EmbeddedTagsService` with Microsoft People Tag parsing
3. ✅ Integrate embedded tag extraction into image processing workflow

### Phase 2: UI Enhancement (Week 2)
1. ✅ Update image cards to show embedded vs AI-detected people
2. ✅ Add status indicators for different processing stages
3. ✅ Enhance filename generation logic

### Phase 3: Testing & Refinement (Week 3)
1. ✅ Test with real photos containing Windows Photo Gallery tags
2. ✅ Refine XMP parsing for different metadata formats
3. ✅ Add error handling and edge cases

## 💡 Benefits of This Approach

### ✅ Advantages
- **Privacy-First**: All processing happens locally, no cloud API dependencies
- **Respects User Intent**: Uses people your mom has already identified
- **Offline Capable**: Works without internet connection
- **Cost-Free**: No additional API costs or rate limits
- **Fast Processing**: Metadata extraction is much faster than AI analysis
- **Accurate Names**: Uses exact names your mom chose, not AI guesses

### 🔄 Smart Fallback System
1. **First Priority**: Use embedded people tags (most accurate)
2. **Second Priority**: Use Claude AI detection (if no embedded tags)
3. **Always Include**: Date and AI description for context

## 📋 Requirements for Your Mom

To make this work optimally, your mom should:

1. **Use Windows Photo Gallery** or similar software that writes XMP people tags
2. **Tag people in photos** before using your app
3. **Save photos with metadata** (don't use apps that strip metadata)

## 🎯 Success Metrics

- **Embedded Tag Detection Rate**: % of photos with successfully extracted people tags
- **Filename Quality**: Improvement in filename descriptiveness
- **Processing Speed**: Faster processing when embedded tags are available
- **User Satisfaction**: Your mom's feedback on filename accuracy

This approach gives you the best of both worlds: using your mom's existing work while providing intelligent fallbacks!