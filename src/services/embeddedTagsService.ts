// Service for extracting people tags from embedded photo metadata (XMP)

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

export interface TagExtractionResult {
  people: EmbeddedPerson[];
  hasEmbeddedTags: boolean;
  metadata?: {
    software?: string;
    processingApp?: string;
  };
}

class EmbeddedTagsService {

  // Extract people tags from photo metadata
  async extractPeopleTags(imageFile: File): Promise<TagExtractionResult> {
    try {
      console.log('🔍 Extracting embedded people tags from:', imageFile.name);

      // Configure exifr to read XMP metadata
      const metadata = await exifr.parse(imageFile, {
        xmp: true,        // Enable XMP extraction
        tiff: true,       // Enable TIFF/EXIF for software info
        icc: false,       // Disable ICC (not needed)
        iptc: false,      // Disable IPTC (not needed)
        jfif: false,      // Disable JFIF (not needed)
        interop: false,   // Disable Interop (not needed)
        gps: false        // Disable GPS (not needed)
      });

      if (!metadata) {
        console.log('📭 No metadata found in image');
        return { people: [], hasEmbeddedTags: false };
      }

      const result: TagExtractionResult = {
        people: [],
        hasEmbeddedTags: false,
        metadata: {
          software: metadata.Software || metadata.ProcessingSoftware,
          processingApp: metadata.ProcessingSoftware
        }
      };

      // Check for XMP metadata
      if (metadata.xmp) {
        console.log('📋 XMP metadata found, parsing people tags...');
        result.people = this.parsePeopleFromXMP(metadata.xmp);
        result.hasEmbeddedTags = result.people.length > 0;

        if (result.people.length > 0) {
          console.log(`👥 Found ${result.people.length} embedded people tags:`,
            result.people.map(p => p.name).join(', '));
        } else {
          console.log('👤 No people tags found in XMP metadata');
        }
      } else {
        console.log('📭 No XMP metadata found');
      }

      return result;
    } catch (error) {
      console.error('❌ Error extracting people tags:', error);
      return { people: [], hasEmbeddedTags: false };
    }
  }

  // Parse people tags from XMP metadata string
  private parsePeopleFromXMP(xmpString: string): EmbeddedPerson[] {
    const people: EmbeddedPerson[] = [];

    try {
      // Microsoft People Tag Schema (Windows Photo Gallery)
      const msftPeople = this.parseMicrosoftPeopleTags(xmpString);
      people.push(...msftPeople);

      // Adobe/MWG Regions (Adobe Bridge, Lightroom, etc.)
      const mwgPeople = this.parseMWGRegions(xmpString);
      people.push(...mwgPeople);

      // IPTC4XMP-Ext Person in Image (other software)
      const iptcPeople = this.parseIPTCPersonTags(xmpString);
      people.push(...iptcPeople);

    } catch (error) {
      console.error('❌ Error parsing XMP people tags:', error);
    }

    // Remove duplicates based on name
    const uniquePeople = people.filter((person, index, self) =>
      index === self.findIndex(p => p.name.toLowerCase() === person.name.toLowerCase())
    );

    return uniquePeople;
  }

  // Parse Microsoft People Tag Schema (Windows Photo Gallery)
  private parseMicrosoftPeopleTags(xmpString: string): EmbeddedPerson[] {
    const people: EmbeddedPerson[] = [];

    try {
      // Look for Microsoft Photo (MP) namespace regions
      // Format: <MP:RegionInfo>...<MP:Regions>...<rdf:li>...person data...</rdf:li>

      const regionInfoMatch = xmpString.match(/<MP:RegionInfo[^>]*>(.*?)<\/MP:RegionInfo>/s);
      if (!regionInfoMatch) {
        return people;
      }

      const regionsMatch = regionInfoMatch[1].match(/<MP:Regions[^>]*>(.*?)<\/MP:Regions>/s);
      if (!regionsMatch) {
        return people;
      }

      // Extract individual person regions
      const personRegions = regionsMatch[1].match(/<rdf:li[^>]*>(.*?)<\/rdf:li>/gs);
      if (!personRegions) {
        return people;
      }

      for (const region of personRegions) {
        const personName = this.extractMSPersonName(region);
        const boundingBox = this.extractMSBoundingBox(region);

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

  // Parse MWG (Metadata Working Group) Regions (Adobe software)
  private parseMWGRegions(xmpString: string): EmbeddedPerson[] {
    const people: EmbeddedPerson[] = [];

    try {
      // Look for MWG-rs (Metadata Working Group - Regions) namespace
      const regionInfoMatch = xmpString.match(/<mwg-rs:RegionInfo[^>]*>(.*?)<\/mwg-rs:RegionInfo>/s);
      if (!regionInfoMatch) {
        return people;
      }

      const regionsMatch = regionInfoMatch[1].match(/<mwg-rs:Regions[^>]*>(.*?)<\/mwg-rs:Regions>/s);
      if (!regionsMatch) {
        return people;
      }

      const regionList = regionsMatch[1].match(/<rdf:li[^>]*>(.*?)<\/rdf:li>/gs);
      if (!regionList) {
        return people;
      }

      for (const region of regionList) {
        const nameMatch = region.match(/<mwg-rs:Name[^>]*>([^<]+)<\/mwg-rs:Name>/);
        if (nameMatch) {
          people.push({
            name: nameMatch[1].trim(),
            source: 'adobe_bridge'
          });
        }
      }

    } catch (error) {
      console.error('❌ Error parsing MWG regions:', error);
    }

    return people;
  }

  // Parse IPTC4XMP-Ext Person in Image tags
  private parseIPTCPersonTags(xmpString: string): EmbeddedPerson[] {
    const people: EmbeddedPerson[] = [];

    try {
      // Look for IPTC Extension PersonInImage
      const personMatches = xmpString.match(/<Iptc4xmpExt:PersonInImage[^>]*>(.*?)<\/Iptc4xmpExt:PersonInImage>/gs);
      if (personMatches) {
        for (const match of personMatches) {
          const nameMatch = match.match(/>([^<]+)</);
          if (nameMatch) {
            people.push({
              name: nameMatch[1].trim(),
              source: 'other_xmp'
            });
          }
        }
      }

      // Also check for simple bag format
      const bagMatch = xmpString.match(/<Iptc4xmpExt:PersonInImage[^>]*>(.*?)<\/Iptc4xmpExt:PersonInImage>/s);
      if (bagMatch) {
        const liMatches = bagMatch[1].match(/<rdf:li[^>]*>([^<]+)<\/rdf:li>/g);
        if (liMatches) {
          for (const li of liMatches) {
            const nameMatch = li.match(/>([^<]+)</);
            if (nameMatch) {
              people.push({
                name: nameMatch[1].trim(),
                source: 'other_xmp'
              });
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Error parsing IPTC person tags:', error);
    }

    return people;
  }

  // Extract person name from Microsoft format
  private extractMSPersonName(regionXml: string): string | null {
    // Try different Microsoft name fields
    const nameFields = [
      /<MP:PersonDisplayName[^>]*>([^<]+)<\/MP:PersonDisplayName>/,
      /<MP:Name[^>]*>([^<]+)<\/MP:Name>/,
      /<MP:Person[^>]*>([^<]+)<\/MP:Person>/
    ];

    for (const field of nameFields) {
      const match = regionXml.match(field);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  // Extract bounding box from Microsoft format
  private extractMSBoundingBox(regionXml: string): EmbeddedPerson['boundingBox'] {
    try {
      const rectMatch = regionXml.match(/<MP:Rectangle[^>]*>([^<]+)<\/MP:Rectangle>/);
      if (!rectMatch) return undefined;

      // Microsoft format: "x, y, width, height" (normalized 0-1)
      const coords = rectMatch[1].split(',').map(n => parseFloat(n.trim()));
      if (coords.length === 4 && coords.every(n => !isNaN(n))) {
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

  // Get people names formatted for filenames
  async getPeopleNamesForFilename(imageFile: File): Promise<string[]> {
    const result = await this.extractPeopleTags(imageFile);
    return result.people.map(person =>
      person.name.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
    ).filter(name => name.length > 0);
  }

  // Check if photo has any embedded people tags
  async hasPeopleTags(imageFile: File): Promise<boolean> {
    const result = await this.extractPeopleTags(imageFile);
    return result.hasEmbeddedTags;
  }

  // Get summary of tagging software used
  async getTaggingSoftwareInfo(imageFile: File): Promise<string | null> {
    const result = await this.extractPeopleTags(imageFile);
    return result.metadata?.software || result.metadata?.processingApp || null;
  }
}

// Export a singleton instance
export const embeddedTagsService = new EmbeddedTagsService();
export default embeddedTagsService;