import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const battle_id = request.nextUrl.searchParams.get('battle_id')
    if (!battle_id) {
      return NextResponse.json({ error: 'Missing battle_id' }, { status: 400 })
    }

    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .select('player1_id, player2_id, player1_stats, player2_stats')
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

    const stats = isPlayer1 ? battle.player1_stats : battle.player2_stats
    if (!stats) {
      return NextResponse.json({ error: 'Stats not yet saved' }, { status: 404 })
    }

    return NextResponse.json({ stats })
  } catch (err) {
    console.error('/api/battle/get-stats error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
