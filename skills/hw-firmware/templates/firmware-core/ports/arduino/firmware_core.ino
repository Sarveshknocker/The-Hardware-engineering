// Arduino entry point for the portable firmware core.
extern "C" {
#include "app.h"
#include "board.h"
void hal_platform_init(void);
}

static uint32_t s_next;

void setup()
{
  hal_platform_init();
  app_init();
  s_next = millis();
}

void loop()
{
  if ((int32_t)(millis() - s_next) >= 0) {   // wrap-safe fixed period
    s_next += APP_PERIOD_MS;
    app_step();
  }
}
