<script setup lang="ts">
import { Accordion, Container, Heading, Section, Stack } from '@app/ui'
import type { AccordionItem } from '@app/ui'

import siteConfig from '../../site.config'

const items: AccordionItem[] = siteConfig.faq.map((item, index) => ({
  id: `faq-${index + 1}`,
  title: item.question,
  body: item.answer,
}))
</script>

<template>
  <Section id="faq" labelledby="faq-title">
    <Container size="md">
      <Stack :gap="6">
        <Heading id="faq-title" k="site.faq.title" :level="2" />
        <Accordion :items="items" open-id="faq-1" />
      </Stack>
    </Container>
  </Section>
</template>
