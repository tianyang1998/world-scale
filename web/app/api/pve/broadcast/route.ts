import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getBroadcastTier } from '@/lib/economy'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { battle_id, broadcast_tier } = await request.json()
    const tier = getBroadcastTier(broadcast_tier)

    if (tier.cost > 0) {
      const { data: character } = await supabase
        .from('characters')
        .select('gold')
        .eq('user_id', user.id)
        .single()

      if (!character || character.gold < tier.cost) {
        return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
      }

      await supabase
        .from('characters')
        .update({ gold: character.gold - tier.cost })
        .eq('user_id', user.id)
    }

    await supabase
      .from('pve_battles')
      .update({ broadcast_tier: tier.id })
      .eq('id', battle_id)

    return NextResponse.json({ success: true, broadcast_tier: tier.id })

  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}