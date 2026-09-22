idf_component_register(
    SRCS "main.c" "hal_esp_idf.c"
         "../../../src/app.c" "../../../src/fault.c" "../../../src/filters.c" "../../../src/ringbuf.c"
    INCLUDE_DIRS "../../../include"
    REQUIRES driver esp_adc esp_timer
)
