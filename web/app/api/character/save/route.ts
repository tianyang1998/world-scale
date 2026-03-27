import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { calcRealmGoldBonus, BASE_GOLD } from '@/lib/battle'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, realm, power, stats } = await request.json()
    if (!realm || power === undefined || !stats) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch existing character
    const { data: existing } = await supabase
      .from('characters')
      .select('realms, total_power, gold')
      .eq('user_id', user.id)
      .single()

    const isNewCharacter = !existing

    // Merge new realm score
    const updatedRealms = {
      ...(existing?.realms ?? {}),
      [realm]: { power, stats },
    }

    // Recalculate total_power
    const totalPower = Object.values(updatedRealms as Record<string, { power: number }>)
      .reduce((sum, r) => sum + r.power, 0)

    // Calculate gold
    // — new character gets BASE_GOLD (1000)
    // — every realm save gives a bonus based on realm power
    const realmGoldBonus = calcRealmGoldBonus(power)
    const currentGold = existing?.gold ?? 0
    const baseGold = isNewCharacter ? BASE_GOLD : 0
    const updatedGold = currentGold + baseGold + realmGoldBonus

    // Upsert character
    const { error: upsertError } = await supabase
      .from('characters')
      .upsert({
        user_id: user.id,
        name: name || null,
        realms: updatedRealms,
        total_power: totalPower,
        gold: updatedGold,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      total_power: totalPower,
      gold: updatedGold,
      gold_earned: baseGold + realmGoldBonus,
    })

  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
