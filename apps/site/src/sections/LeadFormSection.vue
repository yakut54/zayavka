<script setup lang="ts">
import { Container, Heading, Section, Stack, Surface, Text } from '@app/ui'
import { defineAsyncComponent, hydrateOnVisible } from 'vue'

import siteConfig from '../../site.config'
import { LEAD_FORM_ID } from '../composables/useLeadFormBus'

// Форма подгружается лениво и гидратируется, когда попадёт в окно просмотра.
const LeadForm = defineAsyncComponent({
  loader: () => import('../features/lead-form/LeadForm.vue'),
  hydrate: hydrateOnVisible({ rootMargin: '400px' }),
})
const minutes = siteConfig.leadForm.callbackMinutes
</script>

<template>
  <Section :id="LEAD_FORM_ID" tone="accent" labelledby="lead-form-title">
    <Container size="sm">
      <Surface :padding="8" shadow="md">
        <Stack :gap="6">
          <Stack :gap="2">
            <Heading id="lead-form-title" k="lead.form.title" :level="2" />
            <Text k="lead.form.subtitle" :args="{ minutes }" tone="muted" as="p" />
          </Stack>
          <LeadForm />
        </Stack>
      </Surface>
    </Container>
  </Section>
</template>
