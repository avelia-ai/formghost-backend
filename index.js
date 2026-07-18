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

const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function detectMediaType(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  return 'image/jpeg';
}

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

app.post('/api/analyze-progress', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requis' });

    const { data: photos, error: photosErr } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    if (photosErr) return res.status(500).json({ error: photosErr.message });

    const before = photos.find(function(p) { return p.photo_type === 'before'; });
    const after = photos.find(function(p) { return p.photo_type === 'after'; });
    if (!before || !after) {
      return res.status(400).json({ error: 'Il faut une photo avant et une photo apres pour lancer l\'analyse' });
    }

    const { data: beforeFile, error: beforeErr } = await supabase.storage.from('progress-photos').download(before.storage_path);
    if (beforeErr) return res.status(500).json({ error: beforeErr.message });
    const { data: afterFile, error: afterErr } = await supabase.storage.from('progress-photos').download(after.storage_path);
    if (afterErr) return res.status(500).json({ error: afterErr.message });

    const beforeBuffer = Buffer.from(await beforeFile.arrayBuffer());
    const afterBuffer = Buffer.from(await afterFile.arrayBuffer());

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Voici deux photos corporelles de la meme personne, "avant" et "apres" un programme sportif. Analyse les changements visibles de facon factuelle et bienveillante. Precise explicitement que ce sont des estimations visuelles approximatives, pas des mesures cliniques. Reponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises markdown, avec exactement cette structure: {"fat_percentage_estimate":"fourchette approximative, ex 15-18%","muscle_mass_estimate":"evolution qualitative, ex leger gain visible","physical_age_estimate":"fourchette d\'age approx, ex 25-28 ans","symmetry":"bon, moyen ou a travailler","balance":"bon, moyen ou a travailler","strengths":["point fort 1","point fort 2"],"weaknesses":["point a travailler 1"],"summary":"description factuelle en 2 a 3 phrases des changements visibles entre les deux photos"}'
          },
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(beforeBuffer), data: beforeBuffer.toString('base64') } },
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(afterBuffer), data: afterBuffer.toString('base64') } }
        ]
      }]
    });

    const textBlock = message.content.find(function(c) { return c.type === 'text'; });
    const rawText = textBlock ? textBlock.text : '{}';
    let analysis;
    try {
      analysis = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (e) {
      analysis = { summary: rawText };
    }

    res.json({ analysis: analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-program', async (req, res) => {
  try {
    const { user_id, goal_description } = req.body;
    if (!user_id || !goal_description) {
      return res.status(400).json({ error: 'user_id et goal_description sont requis' });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('age, sex, height_cm, weight_kg, fitness_level, main_goal, injuries')
      .eq('id', user_id)
      .maybeSingle();
    if (profileErr) return res.status(500).json({ error: profileErr.message });

    const profileText = profile
      ? 'Age: ' + (profile.age || 'non renseigne') +
        ', Sexe: ' + (profile.sex || 'non renseigne') +
        ', Taille: ' + (profile.height_cm || 'non renseignee') + 'cm' +
        ', Poids: ' + (profile.weight_kg || 'non renseigne') + 'kg' +
        ', Niveau: ' + (profile.fitness_level || 'non renseigne') +
        ', Blessures/douleurs connues: ' + (profile.injuries || 'aucune signalee')
      : 'Profil non renseigne';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: 'Tu es un coach sportif specialise en musculation. Voici le profil de la personne: ' + profileText + '. Voici ce qu\'elle veut atteindre: "' + goal_description + '". Construis un programme de musculation personnalise et realiste. Tiens compte des blessures signalees en adaptant/evitant les exercices a risque pour cette zone. Pour chaque exercice, indique un schema de mouvement parmi exactement ces valeurs (en minuscules, avec underscore): poussee_horizontale, poussee_verticale, tirage_horizontal, tirage_vertical, squat, hip_hinge, fente, flexion_coude, elevation_laterale, flexion_abdo, gainage, cardio. Ajoute aussi 2 a 3 conseils d\'execution courts et concrets par exercice (position de depart, erreur frequente a eviter, point de controle). Reponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises markdown, avec exactement cette structure: {"program_name":"nom court du programme","duration_weeks":8,"sessions_per_week":3,"weekly_schedule":[{"day":"Jour 1","focus":"ex: Haut du corps","exercises":[{"name":"nom exercice","category":"poussee_horizontale","sets":4,"reps":"8-10","rest_seconds":90,"notes":"conseil bref","execution_tips":["conseil 1","conseil 2","conseil 3"]}]}],"general_advice":"2-3 phrases de conseils generaux adaptes au profil et a l\'objectif"}'
        }]
      }]
    });

    const textBlock = message.content.find(function(c) { return c.type === 'text'; });
    const rawText = textBlock ? textBlock.text : '{}';
    let programJson;
    try {
      programJson = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error('JSON parse error:', e.message);
      console.error('rawText length:', rawText.length);
      console.error('stop_reason:', message.stop_reason);
      console.error('last 300 chars:', rawText.slice(-300));
      programJson = { general_advice: rawText };
    }

    const { data: saved, error: saveErr } = await supabase
      .from('programs')
      .insert({ user_id, goal_description, program_json: programJson })
      .select()
      .single();
    if (saveErr) return res.status(500).json({ error: saveErr.message });

    res.json({ program: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/programs/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ programs: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FormGhost backend running on port ${PORT}`);
});
