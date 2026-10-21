<script setup lang="ts">
import { Button, Container, Heading, Section, Stack, Text } from '@app/ui'

import { useSeo } from '../composables/useSeo'

useSeo({
  title: 'site.notFound.title',
  description: 'site.notFound.text',
  path: '/404',
  noindex: true,
})
</script>

<template>
  <Section spacing="lg" labelledby="not-found-title">
    <Container size="md">
      <Stack :gap="6" align="start">
        <Heading id="not-found-title" k="site.notFound.title" :level="1" />
        <Text k="site.notFound.text" tone="muted" as="p" />
        <Button label="nav.home" to="/" />
      </Stack>
    </Container>
  </Section>
</template>
