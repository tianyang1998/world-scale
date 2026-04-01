// app/api/pve/create/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { BOSSES } from '@/lib/boss'
import { getTierStyle } from '@/lib/types'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the player's character to determine their tier
  const { data: character, error: charError } = await supabase
    .from('characters')
    .select('total_power, gold')
    .eq('user_id', user.id)
    .single()

  if (charError || !character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  const tier = getTierStyle(character.total_power).name
  const boss = BOSSES[tier]

  if (!boss) {
    return NextResponse.json({ error: 'No boss found for your tier' }, { status: 400 })
  }

  // Create the PvE battle record
  const { data: battle, error: battleError } = await supabase
    .from('pve_battles')
    .insert({
      boss_tier: tier,
      boss_name: boss.name,
      player_ids: [user.id],
      success: false,
      gold_awarded: 0,
    })
    .select('id')
    .single()

  if (battleError || !battle) {
    return NextResponse.json({ error: 'Failed to create battle' }, { status: 500 })
  }

  return NextResponse.json({
    battle_id: battle.id,
    boss_tier: tier,
    boss_name: boss.name,
    boss_icon: boss.icon,
    boss_lore: boss.lore,
    boss_hp: boss.hp,
    boss_attack: boss.attack,
    boss_defence: boss.defence,
    gold_reward: boss.goldReward,
  })
}
