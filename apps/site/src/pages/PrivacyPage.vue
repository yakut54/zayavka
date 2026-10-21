<script setup lang="ts">
import { Alert, Container, Heading, Section, Stack, Text } from '@app/ui'

import siteConfig from '../../site.config'
import { useSeo } from '../composables/useSeo'

const SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(
  new Date(`${siteConfig.policyDate}T00:00:00`),
)

useSeo({
  title: 'content.legal.privacy.title',
  description: 'content.legal.privacy.s1Text',
  path: '/privacy',
})
</script>

<template>
  <Section labelledby="privacy-title">
    <Container size="md">
      <Stack :gap="6">
        <Heading id="privacy-title" k="content.legal.privacy.title" :level="1" />
        <Text k="site.legal.effective" :args="{ date }" tone="muted" as="p" />
        <Alert tone="info" k="site.legal.template" />
        <Stack v-for="n in SECTIONS" :key="n" :gap="2">
          <Heading :k="`content.legal.privacy.s${n}Title` as never" :level="2" variant="h3" />
          <Text :k="`content.legal.privacy.s${n}Text` as never" as="p" />
        </Stack>
      </Stack>
    </Container>
  </Section>
</template>
