# Host build of the portable firmware core (logic tests run on your PC, no hardware needed).
CC      ?= gcc
CFLAGS  ?= -std=c99 -Wall -Wextra -Werror -Wshadow -O1 -g
INC      = -Iinclude
SRC      = $(wildcard src/*.c)
TESTS    = $(wildcard tests/*.c)

test: test_core
	./test_core

test_core: $(SRC) $(TESTS) $(wildcard include/*.h)
	$(CC) $(CFLAGS) $(INC) $(SRC) $(TESTS) -lm -o $@

# Optional: sanitizers catch buffer overruns and undefined behaviour in the logic (Linux/macOS)
asan: CFLAGS += -fsanitize=address,undefined -fno-omit-frame-pointer
asan: clean test

clean:
	rm -f test_core test_core.exe

.PHONY: test asan clean
