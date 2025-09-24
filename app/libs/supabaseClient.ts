import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta as any).env.VITE_BUDGET_SUPABASE_URL
const supabaseKey = (import.meta as any).env.VITE_BUDGET_SUPABASE_ANON_KEY

console.log('Supabase URL:', supabaseUrl)
console.log('Supabase Key exists:', !!supabaseKey)

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Test connection with more debugging
console.log('Testing connection to:', supabaseUrl)

// Test 1: Try a simple count query
supabase.from('categories').select('count', { count: 'exact' })
  .then(result => {
    console.log('Categories count test:', result)
  })
  .catch(error => {
    console.error('Categories count error:', error)
  })

// Test 2: Try selecting specific columns
supabase.from('categories').select('id, name').limit(1)
  .then(result => {
    console.log('Categories select test:', result)
  })
  .catch(error => {
    console.error('Categories select error:', error)
  })

// Test 3: Check if we can access any table
supabase.auth.getSession()
  .then(({ data: { session }, error }) => {
    console.log('Auth session:', session)
    console.log('Auth error:', error)
  })
  