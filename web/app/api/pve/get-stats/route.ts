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
      .from('pve_battles')
      .select('player_ids, player_stats')
      .eq('id', battle_id)
      .single()

    if (battleError || !battle) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 })
    }

    if (!battle.player_ids.includes(user.id)) {
      return NextResponse.json({ error: 'Not a participant — join via the prep page first' }, { status: 403 })
    }

    const stats = battle.player_stats?.[user.id]
    if (!stats) {
      return NextResponse.json({ error: 'Stats not yet saved' }, { status: 404 })
    }

    return NextResponse.json({ stats })
  } catch (err) {
    console.error('/api/pve/get-stats error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
