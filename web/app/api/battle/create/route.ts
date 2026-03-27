import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isSameTier } from '@/lib/battle'
import { getTier } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { opponent_id } = await request.json()
    if (!opponent_id) {
      return NextResponse.json({ error: 'Missing opponent_id' }, { status: 400 })
    }

    if (opponent_id === user.id) {
      return NextResponse.json({ error: 'Cannot battle yourself' }, { status: 400 })
    }

    // Fetch both players' characters
    const { data: players, error: fetchError } = await supabase
      .from('characters')
      .select('user_id, name, total_power, gold, realms')
      .in('user_id', [user.id, opponent_id])

    if (fetchError || !players || players.length < 2) {
      return NextResponse.json({ error: 'One or both players have no character' }, { status: 400 })
    }

    const me       = players.find(p => p.user_id === user.id)!
    const opponent = players.find(p => p.user_id === opponent_id)!

    // Tier check — must be same tier to battle
    const myTier       = getTier(me.total_power)
    const opponentTier = getTier(opponent.total_power)

    if (!isSameTier(myTier, opponentTier)) {
      return NextResponse.json({
        error: `Tier mismatch — you are ${myTier}, opponent is ${opponentTier}`,
      }, { status: 400 })
    }

    // Create battle record
    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .insert({
        player1_id: user.id,
        player2_id: opponent_id,
      })
      .select('id')
      .single()

    if (battleError || !battle) {
      return NextResponse.json({ error: 'Failed to create battle' }, { status: 500 })
    }

    return NextResponse.json({
      battle_id: battle.id,
      player1: { id: me.user_id,       name: me.name,       total_power: me.total_power,       tier: myTier },
      player2: { id: opponent.user_id, name: opponent.name, total_power: opponent.total_power, tier: opponentTier },
    })

  } catch (err) {
    console.error('/api/battle/create error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
