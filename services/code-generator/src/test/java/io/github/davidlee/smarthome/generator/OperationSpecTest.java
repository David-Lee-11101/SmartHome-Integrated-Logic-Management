package io.github.davidlee.smarthome.generator;

import org.junit.Test;
import static org.junit.Assert.*;

public class OperationSpecTest {
    @Test public void decimalIntegersAreCanonicalAndPreserveParsedValues() {
        String[][] values = {{"012", "12"}, {"08", "8"}, {"-012", "-12"}, {"+0008", "8"},
            {"-0", "0"}, {"000", "0"}, {"2147483647", "2147483647"}, {"-2147483648", "-2147483648"}};
        for (String[] value : values) {
            assertEquals(value[1], new OperationSpec("read", OperationSpec.ValueType.INT, value[0]).getLiteralValue());
            assertEquals(value[1], new OperationSpec("read", OperationSpec.ValueType.LONG, value[0]).getLiteralValue());
        }
        assertEquals("9223372036854775807", new OperationSpec("read", OperationSpec.ValueType.LONG, "9223372036854775807").getLiteralValue());
        assertEquals("-9223372036854775808", new OperationSpec("read", OperationSpec.ValueType.LONG, "-9223372036854775808").getLiteralValue());
        assertThrows(NumberFormatException.class, () -> new OperationSpec("read", OperationSpec.ValueType.INT, "2147483648"));
        assertThrows(NumberFormatException.class, () -> new OperationSpec("read", OperationSpec.ValueType.LONG, "9223372036854775808"));
    }

    @Test public void doubleLiteralsPreserveDoubleRatherThanJavaFloatOrOctalParsing() {
        assertEquals("12.0", new OperationSpec("read", OperationSpec.ValueType.DOUBLE, "012").getLiteralValue());
        assertEquals("1.2", new OperationSpec("read", OperationSpec.ValueType.DOUBLE, "1.2f").getLiteralValue());
        assertEquals("-0.0", new OperationSpec("read", OperationSpec.ValueType.DOUBLE, "-0").getLiteralValue());
        assertThrows(IllegalArgumentException.class, () -> new OperationSpec("read", OperationSpec.ValueType.DOUBLE, "Infinity"));
    }
}
