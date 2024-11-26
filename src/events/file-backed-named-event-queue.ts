import * as fs from 'fs';
import * as path from 'path';

import { applicationLogger, NamedEventQueue } from '@eppo/js-client-sdk-common';

export default class FileBackedNamedEventQueue<T> implements NamedEventQueue<T> {
  private readonly queueDirectory: string;
  private readonly metadataFile: string;
  private eventKeys: string[] = [];

  constructor(public readonly name: string) {
    this.queueDirectory = path.resolve(process.cwd(), `.queues/${this.name}`);
    this.metadataFile = path.join(this.queueDirectory, 'metadata.json');

    if (!fs.existsSync(this.queueDirectory)) {
      fs.mkdirSync(this.queueDirectory, { recursive: true });
    }

    this.loadStateFromFile();
  }

  splice(count: number): T[] {
    const events: T[] = [];
    for (let i = 0; i < count; i++) {
      const event = this.shift();
      if (event) {
        events.push(event);
      }
    }
    return events;
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  get length(): number {
    return this.eventKeys.length;
  }

  push(event: T): void {
    const eventKey = this.generateEventKey(event);
    const eventFilePath = this.getEventFilePath(eventKey);
    fs.writeFileSync(eventFilePath, JSON.stringify(event), 'utf8');
    this.eventKeys.push(eventKey);
    this.saveStateToFile();
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (const key of this.eventKeys) {
      const eventFilePath = this.getEventFilePath(key);
      if (fs.existsSync(eventFilePath)) {
        const eventData = fs.readFileSync(eventFilePath, 'utf8');
        yield JSON.parse(eventData) as T;
      }
    }
  }

  shift(): T | undefined {
    if (this.isEmpty()) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const eventKey = this.eventKeys.shift()!;
    const eventFilePath = this.getEventFilePath(eventKey);

    if (fs.existsSync(eventFilePath)) {
      const eventData = fs.readFileSync(eventFilePath, 'utf8');
      fs.unlinkSync(eventFilePath);
      this.saveStateToFile();
      return JSON.parse(eventData) as T;
    }
  }

  private loadStateFromFile(): void {
    if (fs.existsSync(this.metadataFile)) {
      try {
        const metadata = fs.readFileSync(this.metadataFile, 'utf8');
        this.eventKeys = JSON.parse(metadata);
      } catch {
        applicationLogger.error('Failed to parse metadata file. Initializing empty queue.');
        this.eventKeys = [];
      }
    }
  }

  private saveStateToFile(): void {
    fs.writeFileSync(this.metadataFile, JSON.stringify(this.eventKeys), 'utf8');
  }

  private generateEventKey(event: T): string {
    return this.hashEvent(event);
  }

  private getEventFilePath(eventKey: string): string {
    return path.join(this.queueDirectory, `${eventKey}.json`);
  }

  private hashEvent(event: T): string {
    const value = JSON.stringify(event);
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
}
