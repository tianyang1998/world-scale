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
      .from('battles')
      .select('player1_id, player2_id')
      .eq('id', battle_id)
      .single()

    if (battleError || !battle) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 })
    }

    const isPlayer1 = battle.player1_id === user.id
    const isPlayer2 = battle.player2_id === user.id
    if (!isPlayer1 && !isPlayer2) {
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

    const statsField = isPlayer1 ? 'player1_stats' : 'player2_stats'
    const { error: updateError } = await supabase
      .from('battles')
      .update({ [statsField]: { hp, attack, defence, realm } })
      .eq('id', battle_id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save stats' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('/api/battle/save-stats error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
