import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { api } from '../../api'
import { ME_KEY } from '../../queryClient'

export const meQueryOptions = () => ({
  queryKey: ME_KEY,
  queryFn: async () => {
    const { data } = await api.GET('/api/v1/admin/auth/me')
    if (!data) throw new Error('empty response')
    return data
  },
  staleTime: 5 * 60_000,
  retry: false,
})

/** Текущий администратор (кэшируется; guard маршрутов использует тот же запрос). */
export function useMe() {
  return useQuery(meQueryOptions())
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      await api.POST('/api/v1/admin/auth/login', { body: credentials })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  })
}

/** Выход: после запроса кэш очищается целиком. */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.POST('/api/v1/admin/auth/logout')
    },
    onSettled: () => queryClient.clear(),
  })
}

export function useRevokeAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.POST('/api/v1/admin/auth/sessions/revoke-all')
    },
    onSettled: () => queryClient.clear(),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { current_password: string; new_password: string }) => {
      await api.POST('/api/v1/admin/auth/password', { body })
    },
  })
}
