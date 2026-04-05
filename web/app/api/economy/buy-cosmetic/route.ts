import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getCosmetic } from '@/lib/economy'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cosmetic_id, equip } = await request.json()
    const item = getCosmetic(cosmetic_id)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const { data: character } = await supabase
      .from('characters')
      .select('gold, owned_cosmetics, equipped_title, equipped_border')
      .eq('user_id', user.id)
      .single()

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const owned: string[] = character.owned_cosmetics ?? []

    // Check if already owned — if so, just equip/unequip
    if (owned.includes(cosmetic_id)) {
      if (equip) {
        const equipField = item.type === 'title' ? 'equipped_title' : 'equipped_border'
        await supabase
          .from('characters')
          .update({ [equipField]: cosmetic_id })
          .eq('user_id', user.id)
      }
      return NextResponse.json({ success: true, already_owned: true })
    }

    // Purchase
    if (character.gold < item.cost) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      gold: character.gold - item.cost,
      owned_cosmetics: [...owned, cosmetic_id],
    }

    // Auto-equip on purchase if requested
    if (equip !== false) {
      const equipField = item.type === 'title' ? 'equipped_title' : 'equipped_border'
      updates[equipField] = cosmetic_id
    }

    await supabase
      .from('characters')
      .update(updates)
      .eq('user_id', user.id)

    return NextResponse.json({
      success: true,
      gold: character.gold - item.cost,
      owned_cosmetics: updates.owned_cosmetics,
    })

  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}