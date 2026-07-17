require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

app.get('/', (req, res) => {
  res.json({ status: 'FormGhost backend is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { user_id, movement, global_score, risk_score, reps, duration_seconds, metrics } = req.body;
    if (!user_id || !movement) {
      return res.status(400).json({ error: 'user_id et movement sont requis' });
    }
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id, movement, global_score, risk_score, reps, duration_seconds, metrics })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ session: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ sessions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profile/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ profile: data || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profile/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { full_name, age, sex, height_cm, weight_kg, fitness_level, main_goal, injuries } = req.body;
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: user_id,
        full_name, age, sex, height_cm, weight_kg, fitness_level, main_goal, injuries,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ profile: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/progress-photos', async (req, res) => {
  try {
    const { user_id, photo_type, storage_path } = req.body;
    if (!user_id || !photo_type || !storage_path) {
      return res.status(400).json({ error: 'user_id, photo_type et storage_path sont requis' });
    }
    const { data, error } = await supabase
      .from('progress_photos')
      .insert({ user_id, photo_type, storage_path })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ photo: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/progress-photos/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { data, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ photos: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FormGhost backend running on port ${PORT}`);
});
