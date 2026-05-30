package com.travel.config;

import jakarta.servlet.Servlet;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.File;

@Configuration
public class H2ConsoleConfig {

    @Bean
    public ServletRegistrationBean<Servlet> h2ConsoleServletRegistration() {
        try {
            Class<?> servletClass = Class.forName("org.h2.server.web.JakartaWebServlet");
            Servlet servlet = (Servlet) servletClass.getDeclaredConstructor().newInstance();
            ServletRegistrationBean<Servlet> registration = new ServletRegistrationBean<>(servlet);
            registration.addUrlMappings("/h2-console/*");
            
            // Configure H2 Web Console to look for .h2.server.properties in the project root directory
            File projectDir = new File(".");
            registration.addInitParameter("properties", projectDir.getAbsolutePath());
            registration.addInitParameter("webAllowOthers", "true");
            
            return registration;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to initialize H2 Console WebServlet dynamically", e);
        }
    }
}

