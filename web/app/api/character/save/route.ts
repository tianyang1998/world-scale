import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
      .select('realms, total_power')
      .eq('user_id', user.id)
      .single()

    // Merge new realm score
    const updatedRealms = {
      ...(existing?.realms ?? {}),
      [realm]: { power, stats },
    }

    // Recalculate total_power
    const totalPower = Object.values(updatedRealms as Record<string, { power: number }>)
      .reduce((sum, r) => sum + r.power, 0)

    // Upsert — name is stored at character level, not per realm
    const { error: upsertError } = await supabase
      .from('characters')
      .upsert({
        user_id: user.id,
        name: name || null,
        realms: updatedRealms,
        total_power: totalPower,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, total_power: totalPower })

  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
