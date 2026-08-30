import { useState } from "react";
import { z } from "zod";

interface ValidationErrors {
  [key: string]: string;
}

export function useFormValidation<T extends z.ZodType<any, any>>(schema: T) {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validate = (data: z.infer<T>): boolean => {
    try {
      schema.parse(data);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: ValidationErrors = {};
        error.errors.forEach((err) => {
          const path = err.path.join(".");
          newErrors[path] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const validateField = (fieldName: string, value: any): boolean => {
    try {
      // Validate single field
      const fieldSchema = schema._def.schema?.shape?.[fieldName];
      if (fieldSchema) {
        fieldSchema.parse(value);
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
        return true;
      }
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setErrors((prev) => ({
          ...prev,
          [fieldName]: error.errors[0].message,
        }));
      }
      return false;
    }
  };

  const clearErrors = () => setErrors({});

  const clearError = (fieldName: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  };

  return {
    errors,
    validate,
    validateField,
    clearErrors,
    clearError,
    hasErrors: Object.keys(errors).length > 0,
  };
}
