-- CampusQuest MVP seed data (idempotent)

insert into public.activities (slug, name, description, stat_key, base_xp, is_active)
values
  ('study-session', 'Study Session', 'Focused studying for classes.', 'knowledge', 40, true),
  ('gym-workout', 'Gym Workout', 'Strength and conditioning workout.', 'strength', 45, true),
  ('campus-run', 'Campus Run', 'Outdoor run around campus.', 'stamina', 42, true),
  ('club-meeting', 'Club Meeting', 'Attend and contribute at a club.', 'social', 32, true),
  ('deep-focus', 'Deep Focus Block', 'Distraction-free work sprint.', 'focus', 38, true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  stat_key = excluded.stat_key,
  base_xp = excluded.base_xp,
  is_active = excluded.is_active;

insert into public.quests (slug, title, description, quest_type, target_count, xp_reward, is_repeatable, is_active)
values
  ('daily-two-study', 'Scholars Grind', 'Complete 2 study sessions today.', 'daily', 2, 120, true, true),
  ('daily-move-body', 'Move Your Body', 'Log 1 fitness activity.', 'daily', 1, 95, true, true),
  ('weekly-social', 'Network Builder', 'Attend 3 club or social activities.', 'weekly', 3, 260, true, true),
  ('special-finals-week', 'Finals Week Survivor', 'Complete 8 activities in finals week.', 'special', 8, 600, false, true)
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  quest_type = excluded.quest_type,
  target_count = excluded.target_count,
  xp_reward = excluded.xp_reward,
  is_repeatable = excluded.is_repeatable,
  is_active = excluded.is_active;

insert into public.bosses (slug, name, description, max_hp, xp_reward, min_level, is_active)
values
  ('midterm-crusher', 'Midterm Crusher', 'A heavy exam week challenge.', 320, 260, 2, true),
  ('finals-overlord', 'Finals Overlord', 'The end-of-semester gauntlet.', 650, 520, 5, true),
  ('group-project-hydra', 'Group Project Hydra', 'Coordination challenge boss.', 480, 380, 4, true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  max_hp = excluded.max_hp,
  xp_reward = excluded.xp_reward,
  min_level = excluded.min_level,
  is_active = excluded.is_active;

insert into public.items (slug, name, description, item_type, rarity, metadata, is_active)
values
  ('energy-drink', 'Energy Drink', 'Consumable that boosts your next activity.', 'consumable', 'common', '{"effect":"xp_boost_small"}'::jsonb, true),
  ('focus-lens', 'Focus Lens', 'Equipment that favors focus outcomes.', 'equipment', 'uncommon', '{"effect":"focus_bonus"}'::jsonb, true),
  ('gold-hoodie', 'Gold Hoodie', 'Cosmetic reward for grinders.', 'cosmetic', 'rare', '{"slot":"outfit"}'::jsonb, true),
  ('mythic-backpack', 'Mythic Backpack', 'Legendary campus style drop.', 'cosmetic', 'legendary', '{"slot":"backpack"}'::jsonb, true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  item_type = excluded.item_type,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  is_active = excluded.is_active;

