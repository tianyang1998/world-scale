import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { calcInsuranceRefund } from '@/lib/economy'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { battle_id, gold_transferred } = await request.json()
    if (!battle_id || gold_transferred === undefined) {
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

    // Caller must be a participant — and they are reporting their own death,
    // so the winner is the other player. Never trust winner_id from the client.
    const { player1_id, player2_id } = battle
    if (user.id !== player1_id && user.id !== player2_id) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }
    const winner_id = user.id === player1_id ? player2_id : player1_id
    const loser_id = user.id

    // Fetch both players' gold
    const { data: players } = await supabase
      .from('characters')
      .select('user_id, gold, active_insurance')
      .in('user_id', [winner_id, loser_id])

    if (!players || players.length < 2) {
      return NextResponse.json({ error: 'Could not fetch player gold' }, { status: 500 })
    }

    const winner = players.find(p => p.user_id === winner_id)!
    const loser  = players.find(p => p.user_id === loser_id)!

    const actualTransfer = Math.min(gold_transferred, loser.gold) // can't transfer more than loser has

    // Calculate insurance refund for loser
    let insuranceRefund = 0
    if (loser.active_insurance) {
      insuranceRefund = calcInsuranceRefund(actualTransfer, loser.active_insurance)
    }

    const loserNetLoss = actualTransfer - insuranceRefund

    // Update winner gold
    await supabase
      .from('characters')
      .update({ gold: winner.gold + actualTransfer })
      .eq('user_id', winner_id)

    // Update loser gold and clear insurance (consumed win or lose)
    await supabase
      .from('characters')
      .update({
        gold: Math.max(0, loser.gold - loserNetLoss),
        active_insurance: null,
      })
      .eq('user_id', loser_id)

    // Also clear winner's insurance if they had one (consumed on match entry)
    await supabase
      .from('characters')
      .update({ active_insurance: null })
      .eq('user_id', winner_id)

    // Mark battle as complete
    await supabase
      .from('battles')
      .update({ winner_id, gold_transferred: actualTransfer, insurance_refund: insuranceRefund })
      .eq('id', battle_id)

    return NextResponse.json({ success: true, gold_transferred: actualTransfer, insurance_refund: insuranceRefund })

  } catch (err) {
    console.error('/api/battle/end error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
