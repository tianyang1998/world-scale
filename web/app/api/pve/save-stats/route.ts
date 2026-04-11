import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { battle_id, hp, attack, defence, realm } = await request.json()
    if (!battle_id || !hp || !attack || !defence || !realm) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch battle to verify the caller is a participant
    const { data: battle, error: battleError } = await supabase
      .from('pve_battles')
      .select('player_ids, player_stats')
      .eq('id', battle_id)
      .single()

    if (battleError || !battle) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 })
    }

    if (!battle.player_ids.includes(user.id)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }

    // Validate stats sum against character total_power
    const { data: character } = await supabase
      .from('characters')
      .select('total_power')
      .eq('user_id', user.id)
      .single()

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (hp + attack + defence !== character.total_power) {
      return NextResponse.json({ error: 'Stats do not sum to total_power' }, { status: 400 })
    }

    // player_stats is a JSON object keyed by user_id
    const existingStats = battle.player_stats ?? {}
    const updatedStats = { ...existingStats, [user.id]: { hp, attack, defence, realm } }

    const { error: updateError } = await supabase
      .from('pve_battles')
      .update({ player_stats: updatedStats })
      .eq('id', battle_id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save stats' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('/api/pve/save-stats error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
