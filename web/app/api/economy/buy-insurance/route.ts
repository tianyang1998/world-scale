import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getInsuranceTier } from '@/lib/economy'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { insurance_id } = await request.json()
    const tier = getInsuranceTier(insurance_id)

    if (tier.id === 'none') {
      await supabase
        .from('characters')
        .update({ active_insurance: null })
        .eq('user_id', user.id)
      return NextResponse.json({ success: true, insurance: null })
    }

    const { data: character } = await supabase
      .from('characters')
      .select('gold, active_insurance')
      .eq('user_id', user.id)
      .single()

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.active_insurance) {
      return NextResponse.json({ error: 'You already have active insurance' }, { status: 400 })
    }

    if (character.gold < tier.cost) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    await supabase
      .from('characters')
      .update({
        gold: character.gold - tier.cost,
        active_insurance: tier.id,
      })
      .eq('user_id', user.id)

    return NextResponse.json({
      success: true,
      gold: character.gold - tier.cost,
      insurance: tier.id,
    })

  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}