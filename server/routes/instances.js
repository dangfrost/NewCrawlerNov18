import express from 'express';
import { getDb, generateId } from '../db/client.js';
import { databaseInstances } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// List all instances
router.get('/', requireAuth, async (req, res) => {
  try {
    console.log('instancesList: Starting request');
    console.log('instancesList: User authenticated:', req.user?.email);

    const db = getDb();

    console.log('instancesList: Querying database');
    const instances = await db
      .select()
      .from(databaseInstances)
      .orderBy(desc(databaseInstances.created_date));

    console.log('instancesList: Found instances:', instances.length);
    res.json({ data: instances });
  } catch (error) {
    console.error('List instances error:', error);
    res.status(500).json({
      error: error.message,
      details: error.stack?.substring(0, 500)
    });
  }
});

// Get single instance
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [instance] = await db
      .select()
      .from(databaseInstances)
      .where(eq(databaseInstances.id, id));

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    res.json({ data: instance });
  } catch (error) {
    console.error('Get instance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create instance
router.post('/', requireAuth, async (req, res) => {
  try {
    const instanceData = req.body;
    const db = getDb();

    const newInstance = {
      id: generateId(),
      created_date: new Date(),
      updated_date: new Date(),
      created_by: req.user.email,
      ...instanceData
    };

    await db.insert(databaseInstances).values(newInstance);

    res.json({ data: newInstance });
  } catch (error) {
    console.error('Create instance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update instance
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const instanceData = req.body;
    const db = getDb();

    const updatedInstance = {
      ...instanceData,
      updated_date: new Date()
    };

    await db
      .update(databaseInstances)
      .set(updatedInstance)
      .where(eq(databaseInstances.id, id));

    res.json({ data: updatedInstance });
  } catch (error) {
    console.error('Update instance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete instance
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    await db.delete(databaseInstances).where(eq(databaseInstances.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete instance error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
