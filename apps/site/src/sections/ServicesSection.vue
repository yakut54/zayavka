<script setup lang="ts">
import { Button, Container, Grid, Heading, Icon, Section, Stack, Surface, Text } from '@app/ui'

import siteConfig from '../../site.config'
import { chooseService } from '../composables/useLeadFormBus'
import { buildMaxBotLink, serviceStartParam } from '../composables/maxLink'

const services = siteConfig.services
const bookingEnabled = siteConfig.max.bookingEnabled
const price = new Intl.NumberFormat('ru-RU')
// 4 карточки в одну строку на широком экране, иначе три колонки по ТЗ
const lgCols = services.length === 4 ? 4 : 3
</script>

<template>
  <Section id="services" labelledby="services-title">
    <Container size="xl">
      <Stack :gap="8">
        <Heading id="services-title" k="site.services.title" :level="2" />
        <Grid :cols="{ base: 1, md: 2, lg: lgCols }" :gap="6" as="ul">
          <li v-for="service in services" :key="service.slug" class="service-item">
            <Surface as="article" class="service-card">
              <Stack :gap="4" class="service-card__body">
                <span class="service-card__icon"><Icon :name="service.icon" size="lg" /></span>
                <Heading :k="service.title" :level="3" />
                <Text :k="service.description" tone="muted" as="p" />
                <Text
                  k="site.services.priceFrom"
                  :args="{ price: price.format(service.priceFrom) }"
                  variant="h3"
                  as="p"
                />
              </Stack>
              <div class="service-card__actions">
                <Button
                  v-if="bookingEnabled && service.bookable"
                  label="site.services.book"
                  :href="buildMaxBotLink(serviceStartParam(service.slug))"
                />
                <Button
                  label="site.services.choose"
                  variant="ghost"
                  @click="chooseService(service.slug)"
                />
              </div>
            </Surface>
          </li>
        </Grid>
      </Stack>
    </Container>
  </Section>
</template>

<style scoped>
.service-item {
  display: flex;
}

.service-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-4);
  width: 100%;
}

.service-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.service-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-md);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}
</style>
