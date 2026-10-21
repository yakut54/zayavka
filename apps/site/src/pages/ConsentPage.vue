<script setup lang="ts">
import { Alert, Container, Heading, Link, Section, Stack, Text } from '@app/ui'

import { useSeo } from '../composables/useSeo'

useSeo({
  title: 'content.legal.consent.title',
  description: 'content.legal.consent.body',
  path: '/consent',
})
</script>

<template>
  <Section labelledby="consent-title">
    <Container size="md">
      <Stack :gap="6">
        <Heading id="consent-title" k="content.legal.consent.title" :level="1" />
        <Alert tone="info" k="site.legal.template" />
        <Text k="content.legal.consent.body" as="p" />
        <Link k="site.footer.privacy" to="/privacy" />
      </Stack>
    </Container>
  </Section>
</template>
