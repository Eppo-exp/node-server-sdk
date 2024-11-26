import * as fs from 'fs';
import * as path from 'path';

import FileBackedNamedEventQueue from './file-backed-named-event-queue';

describe('FileBackedNamedEventQueue', () => {
  describe('string events', () => {
    const queueName = 'testQueue';
    let queue: FileBackedNamedEventQueue<string>;
    const queueDirectory = path.resolve(process.cwd(), `.queues/${queueName}`);

    beforeEach(() => {
      // Clean up the queue directory
      if (fs.existsSync(queueDirectory)) {
        fs.rmSync(queueDirectory, { recursive: true, force: true });
      }
      queue = new FileBackedNamedEventQueue(queueName);
    });

    afterAll(() => {
      if (fs.existsSync(queueDirectory)) {
        fs.rmSync(queueDirectory, { recursive: true, force: true });
      }
    });

    it('should initialize with an empty queue', () => {
      expect(queue.length).toBe(0);
    });

    it('should persist and retrieve events correctly via push and iterator', () => {
      queue.push('event1');
      queue.push('event2');

      expect(queue.length).toBe(2);

      const events = Array.from(queue);
      expect(events).toEqual(['event1', 'event2']);
    });

    it('should persist and retrieve events correctly via push and shift', () => {
      queue.push('event1');
      queue.push('event2');

      const firstEvent = queue.shift();
      expect(firstEvent).toBe('event1');
      expect(queue.length).toBe(1);

      const secondEvent = queue.shift();
      expect(secondEvent).toBe('event2');
      expect(queue.length).toBe(0);
    });

    it('should remove events from file system after shift', () => {
      queue.push('event1');
      const eventFiles = fs.readdirSync(queueDirectory);
      expect(eventFiles.length).toBe(2); // One for metadata.json, one for the event file

      queue.shift();
      const updatedEventFiles = fs.readdirSync(queueDirectory);
      expect(updatedEventFiles.length).toBe(1); // Only metadata.json should remain
    });

    it('should reconstruct the queue from metadata file', () => {
      queue.push('event1');
      queue.push('event2');

      const newQueueInstance = new FileBackedNamedEventQueue<string>(queueName);
      expect(newQueueInstance.length).toBe(2);

      const events = Array.from(newQueueInstance);
      expect(events).toEqual(['event1', 'event2']);
    });

    it('should handle empty shift gracefully', () => {
      expect(queue.shift()).toBeUndefined();
    });

    it('should not fail if metadata file is corrupted', () => {
      const corruptedMetadataFile = path.join(queueDirectory, 'metadata.json');
      fs.writeFileSync(corruptedMetadataFile, '{ corrupted state }');

      const newQueueInstance = new FileBackedNamedEventQueue<string>(queueName);
      expect(newQueueInstance.length).toBe(0);
    });

    it('should handle events with the same content correctly using consistent hashing', () => {
      queue.push('event1');
      queue.push('event1'); // Push the same event content twice

      expect(queue.length).toBe(2);

      const events = Array.from(queue);
      expect(events).toEqual(['event1', 'event1']);
    });

    it('should store each event as a separate file', () => {
      queue.push('event1');
      queue.push('event2');

      const eventFiles = fs.readdirSync(queueDirectory).filter((file) => file !== 'metadata.json');
      expect(eventFiles.length).toBe(2);

      const eventData1 = fs.readFileSync(path.join(queueDirectory, eventFiles[0]), 'utf8');
      const eventData2 = fs.readFileSync(path.join(queueDirectory, eventFiles[1]), 'utf8');

      expect([JSON.parse(eventData1), JSON.parse(eventData2)]).toEqual(['event1', 'event2']);
    });
  });

  describe('arbitrary object shapes', () => {
    const queueName = 'objectQueue';
    let queue: FileBackedNamedEventQueue<{ id: number; name: string }>;
    const queueDirectory = path.resolve(process.cwd(), `.queues/${queueName}`);

    beforeEach(() => {
      // Clean up the queue directory
      if (fs.existsSync(queueDirectory)) {
        fs.rmdirSync(queueDirectory, { recursive: true });
      }
      queue = new FileBackedNamedEventQueue(queueName);
    });

    afterAll(() => {
      if (fs.existsSync(queueDirectory)) {
        fs.rmdirSync(queueDirectory, { recursive: true });
      }
    });

    it('should handle objects with arbitrary shapes via push and shift', () => {
      queue.push({ id: 1, name: 'event1' });
      queue.push({ id: 2, name: 'event2' });

      expect(queue.length).toBe(2);

      const firstEvent = queue.shift();
      expect(firstEvent).toEqual({ id: 1, name: 'event1' });

      const secondEvent = queue.shift();
      expect(secondEvent).toEqual({ id: 2, name: 'event2' });

      expect(queue.length).toBe(0);
    });

    it('should persist and reconstruct queue with objects from metadata file', () => {
      queue.push({ id: 1, name: 'event1' });
      queue.push({ id: 2, name: 'event2' });

      const newQueueInstance = new FileBackedNamedEventQueue<{ id: number; name: string }>(
        queueName,
      );
      expect(newQueueInstance.length).toBe(2);

      const events = Array.from(newQueueInstance);
      expect(events).toEqual([
        { id: 1, name: 'event1' },
        { id: 2, name: 'event2' },
      ]);
    });
  });
});
