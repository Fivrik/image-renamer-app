// Service for detecting and managing people in photos using Claude Vision API

export interface KnownPerson {
  id: string;
  name: string;
  description: string; // Physical description to help Claude identify them
  aliases?: string[]; // Alternative names or nicknames
}

export interface DetectedPerson {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  description?: string;
}

class PeopleDetectionService {
  private knownPeople: KnownPerson[] = [];

  constructor() {
    this.loadKnownPeople();
  }

  // Add a new person to the known people database
  addKnownPerson(person: Omit<KnownPerson, 'id'>): string {
    const newPerson: KnownPerson = {
      id: Date.now().toString(),
      ...person,
    };

    this.knownPeople.push(newPerson);
    this.saveKnownPeople();
    console.log(`➕ Added new person: ${newPerson.name}`);
    return newPerson.id;
  }

  // Remove a person from known people
  removePerson(personId: string): void {
    const index = this.knownPeople.findIndex(p => p.id === personId);
    if (index !== -1) {
      const person = this.knownPeople[index];
      this.knownPeople.splice(index, 1);
      this.saveKnownPeople();
      console.log(`🗑️ Removed ${person.name} from known people`);
    }
  }

  // Update a person's information
  updatePerson(personId: string, updates: Partial<Omit<KnownPerson, 'id'>>): void {
    const person = this.knownPeople.find(p => p.id === personId);
    if (person) {
      Object.assign(person, updates);
      this.saveKnownPeople();
      console.log(`✏️ Updated ${person.name}'s information`);
    }
  }

  // Get all known people
  getKnownPeople(): KnownPerson[] {
    return [...this.knownPeople];
  }

  // Clear all known people
  clearAllPeople(): void {
    this.knownPeople = [];
    localStorage.removeItem('knownPeople');
    console.log('🗑️ Cleared all known people');
  }

  // Detect people in an image using Claude Vision API
  async detectPeopleInImage(imageData: string, originalName: string): Promise<DetectedPerson[]> {
    try {
      console.log('🔍 Analyzing image for people...');

      const response = await fetch("/api/detect-people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          imageData,
          originalName,
          knownPeople: this.knownPeople
        })
      });

      if (!response.ok) {
        console.error('❌ People detection API error:', response.status);
        return [];
      }

      const data = await response.json();
      console.log('✅ People detection response:', data);

      return data.detectedPeople || [];
    } catch (error) {
      console.error('❌ Error detecting people:', error);
      return [];
    }
  }

  // Get names of detected people (for filename generation)
  async getDetectedPeopleNames(imageData: string, originalName: string): Promise<string[]> {
    try {
      const detectedPeople = await this.detectPeopleInImage(imageData, originalName);
      return detectedPeople
        .filter(person => person.confidence === 'high' || person.confidence === 'medium')
        .map(person => person.name.toLowerCase().replace(/\s+/g, '_'));
    } catch (error) {
      console.error('❌ Error getting detected people names:', error);
      return [];
    }
  }

  // Save known people to localStorage
  private saveKnownPeople(): void {
    try {
      localStorage.setItem('knownPeople', JSON.stringify(this.knownPeople));
      console.log(`💾 Saved ${this.knownPeople.length} known people to localStorage`);
    } catch (error) {
      console.error('❌ Error saving known people:', error);
    }
  }

  // Load known people from localStorage
  private loadKnownPeople(): void {
    try {
      const saved = localStorage.getItem('knownPeople');
      if (saved) {
        this.knownPeople = JSON.parse(saved);
        console.log(`📥 Loaded ${this.knownPeople.length} known people from localStorage`);
      }
    } catch (error) {
      console.error('❌ Error loading known people:', error);
      this.knownPeople = [];
    }
  }
}

// Export a singleton instance
export const peopleDetectionService = new PeopleDetectionService();
export default peopleDetectionService;