// app/api/pve/end/route.ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { BOSSES } from '@/lib/boss'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { battle_id, success } = await req.json()

  if (!battle_id) {
    return NextResponse.json({ error: 'Missing battle_id' }, { status: 400 })
  }

  // Fetch the battle to get boss tier
  const { data: battle, error: fetchError } = await supabase
    .from('pve_battles')
    .select('boss_tier, player_ids')
    .eq('id', battle_id)
    .single()

  if (fetchError || !battle) {
    return NextResponse.json({ error: 'Battle not found' }, { status: 404 })
  }

  // Caller must be a participant
  if (!battle.player_ids.includes(user.id)) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const boss = BOSSES[battle.boss_tier]
  const goldReward = success && boss ? boss.goldReward : 0
  // Always use server-side player_ids — never trust surviving_player_ids from client
  const survivors: string[] = success ? battle.player_ids : []

  // Update battle record
  await supabase
    .from('pve_battles')
    .update({
      success,
      gold_awarded: goldReward,
      player_ids: battle.player_ids, // keep full party list
    })
    .eq('id', battle_id)

  // Award gold to each surviving player
  if (success && survivors.length > 0) {
    for (const playerId of survivors) {
      const { data: character } = await supabase
        .from('characters')
        .select('gold')
        .eq('user_id', playerId)
        .single()

      if (character) {
        await supabase
          .from('characters')
          .update({ gold: character.gold + goldReward })
          .eq('user_id', playerId)
      }
    }
  }

  return NextResponse.json({ success, gold_awarded: goldReward })
}
