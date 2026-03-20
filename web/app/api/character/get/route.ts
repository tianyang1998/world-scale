import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the user's character — include name
    const { data: character, error } = await supabase
      .from('characters')
      .select('name, realms, total_power, updated_at')
      .eq('user_id', user.id)
      .single()

    if (error || !character) {
      return NextResponse.json({ character: null })
    }

    return NextResponse.json({ character })

  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
