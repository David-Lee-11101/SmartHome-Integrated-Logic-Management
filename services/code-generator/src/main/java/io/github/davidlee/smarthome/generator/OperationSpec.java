package io.github.davidlee.smarthome.generator;

import java.util.Locale;
import javax.lang.model.SourceVersion;
import java.util.Objects;
import java.util.regex.Pattern;

public final class OperationSpec {
    private static final Pattern JAVA_IDENTIFIER = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]*");

    public enum ValueType {
        BOOLEAN, INT, LONG, DOUBLE, STRING;

        public static ValueType parse(String value) {
            return ValueType.valueOf(Objects.requireNonNull(value, "valueType").toUpperCase(Locale.ROOT));
        }
    }

    private final String name;
    private final ValueType valueType;
    private final String literalValue;

    public OperationSpec(String name, ValueType valueType, String literalValue) {
        if (name == null || !JAVA_IDENTIFIER.matcher(name).matches() || name.length() > 64
                || SourceVersion.isKeyword(name) || "_".equals(name)) {
            throw new IllegalArgumentException("operation name must be a Java identifier of at most 64 characters");
        }
        this.name = name;
        this.valueType = Objects.requireNonNull(valueType, "valueType");
        this.literalValue = validateLiteral(valueType, literalValue);
    }

    private static String validateLiteral(ValueType type, String value) {
        if (value == null || value.length() > 4096) {
            throw new IllegalArgumentException("operation value is required and must be at most 4096 characters");
        }
        switch (type) {
            case BOOLEAN:
                if (!"true".equals(value) && !"false".equals(value)) throw new IllegalArgumentException("invalid boolean");
                break;
            case INT:
                return Integer.toString(Integer.parseInt(value));
            case LONG:
                return Long.toString(Long.parseLong(value));
            case DOUBLE:
                double parsed = Double.parseDouble(value);
                if (!Double.isFinite(parsed)) throw new IllegalArgumentException("double must be finite");
                return Double.toString(parsed);
            case STRING:
                break;
            default:
                throw new IllegalArgumentException("unsupported value type");
        }
        return value;
    }

    public String getName() { return name; }
    public ValueType getValueType() { return valueType; }
    public String getLiteralValue() { return literalValue; }
}
