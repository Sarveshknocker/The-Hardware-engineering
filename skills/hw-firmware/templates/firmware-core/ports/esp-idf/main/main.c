/* ESP-IDF entry point: fixed-period loop calling the portable application. */
#include "app.h"
#include "board.h"
#include "hal.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void hal_platform_init(void);

void app_main(void)
{
    hal_platform_init();
    app_init();
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        app_step();                                            /* feeds the watchdog when a full cycle completes */
        /* Telemetry: drain the store-and-forward buffer here when the network is up, e.g.
         * telemetry_t t; while (network_ready() && app_telemetry_pop(&t)) publish(&t); */
        vTaskDelayUntil(&last, pdMS_TO_TICKS(APP_PERIOD_MS));   /* drift-free period */
    }
}
