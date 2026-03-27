import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { battle_id, winner_id, gold_transferred } = await request.json()
    if (!battle_id || !winner_id || gold_transferred === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch battle to get both player IDs
    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .select('player1_id, player2_id, winner_id')
      .eq('id', battle_id)
      .single()

    if (battleError || !battle) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 })
    }

    // Prevent double-processing
    if (battle.winner_id) {
      return NextResponse.json({ success: true, already_processed: true })
    }

    const loser_id = winner_id === battle.player1_id ? battle.player2_id : battle.player1_id

    // Fetch both players' gold
    const { data: players } = await supabase
      .from('characters')
      .select('user_id, gold')
      .in('user_id', [winner_id, loser_id])

    if (!players || players.length < 2) {
      return NextResponse.json({ error: 'Could not fetch player gold' }, { status: 500 })
    }

    const winner = players.find(p => p.user_id === winner_id)!
    const loser  = players.find(p => p.user_id === loser_id)!

    const actualTransfer = Math.min(gold_transferred, loser.gold) // can't transfer more than loser has

    // Update winner gold
    await supabase
      .from('characters')
      .update({ gold: winner.gold + actualTransfer })
      .eq('user_id', winner_id)

    // Update loser gold
    await supabase
      .from('characters')
      .update({ gold: Math.max(0, loser.gold - actualTransfer) })
      .eq('user_id', loser_id)

    // Mark battle as complete
    await supabase
      .from('battles')
      .update({ winner_id, gold_transferred: actualTransfer })
      .eq('id', battle_id)

    return NextResponse.json({ success: true, gold_transferred: actualTransfer })

  } catch (err) {
    console.error('/api/battle/end error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
