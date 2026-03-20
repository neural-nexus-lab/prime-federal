(function() {
  var body = document.body;

  if (!body) {
    return;
  }

  var sectionName = body.getAttribute("data-content-section");
  if (!sectionName) {
    return;
  }

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function getValue(content, key) {
    if (!content || !key) {
      return undefined;
    }

    return content[key];
  }

  function eachNode(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
  }

  function countIndent(line) {
    return line.length - line.replace(/^ */, "").length;
  }

  function parseDoubleQuoted(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value
        .slice(1, -1)
        .replace(/\\"/g, "\"")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\");
    }
  }

  function parseSingleQuoted(value) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  function parseQuotedScalar(lines, startIndex, initialValue, indent, quoteChar) {
    var parts = [initialValue.replace(/^\s*/, "")];
    var index = startIndex + 1;

    while (index < lines.length) {
      var currentLine = lines[index];
      if (!currentLine.trim()) {
        parts.push(quoteChar === '"' ? "\\n" : "");
        index += 1;
        continue;
      }

      if (countIndent(currentLine) <= indent) {
        break;
      }

      parts.push(currentLine.slice(indent + 2));

      var joined = parts.join(" ");
      if (joined.charAt(joined.length - 1) === quoteChar) {
        return {
          value: quoteChar === '"' ? parseDoubleQuoted(joined) : parseSingleQuoted(joined),
          nextIndex: index + 1
        };
      }

      index += 1;
    }

    return {
      value: parts.join(" "),
      nextIndex: index
    };
  }

  function foldBlock(lines) {
    return lines.reduce(function(result, line, index) {
      if (index === 0) {
        return line;
      }

      if (line === "") {
        return result + "\n";
      }

      if (!result || result.slice(-1) === "\n") {
        return result + line;
      }

      return result + " " + line;
    }, "");
  }

  function parseBlockScalar(lines, startIndex, indent, folded) {
    var blockLines = [];
    var index = startIndex;

    while (index < lines.length) {
      var currentLine = lines[index];
      if (!currentLine.trim()) {
        blockLines.push("");
        index += 1;
        continue;
      }

      if (countIndent(currentLine) < indent) {
        break;
      }

      blockLines.push(currentLine.slice(indent));
      index += 1;
    }

    return {
      value: folded ? foldBlock(blockLines) : blockLines.join("\n"),
      nextIndex: index
    };
  }

  function parseScalar(lines, lineIndex, value, indent) {
    var trimmed = value.replace(/^\s*/, "");

    if (!trimmed) {
      return {
        value: "",
        nextIndex: lineIndex + 1
      };
    }

    if (/^[>|][+-]?$/.test(trimmed)) {
      return parseBlockScalar(lines, lineIndex + 1, indent + 2, trimmed.charAt(0) === ">");
    }

    if (trimmed.charAt(0) === "\"") {
      if (trimmed.charAt(trimmed.length - 1) === "\"" && trimmed.length > 1) {
        return {
          value: parseDoubleQuoted(trimmed),
          nextIndex: lineIndex + 1
        };
      }

      return parseQuotedScalar(lines, lineIndex, value, indent, '"');
    }

    if (trimmed.charAt(0) === "'") {
      if (trimmed.charAt(trimmed.length - 1) === "'" && trimmed.length > 1) {
        return {
          value: parseSingleQuoted(trimmed),
          nextIndex: lineIndex + 1
        };
      }

      return parseQuotedScalar(lines, lineIndex, value, indent, "'");
    }

    return {
      value: trimmed,
      nextIndex: lineIndex + 1
    };
  }

  function parseContentYaml(yamlText) {
    // Decap writes a two-level map here: page section -> flat string fields.
    var lines = yamlText.replace(/\r\n?/g, "\n").split("\n");
    var parsed = {};
    var currentSection = null;
    var index = 0;

    while (index < lines.length) {
      var line = lines[index];
      if (!line.trim() || /^\s*#/.test(line)) {
        index += 1;
        continue;
      }

      if (countIndent(line) === 0) {
        var sectionMatch = line.match(/^([A-Za-z0-9_]+):\s*$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          parsed[currentSection] = {};
        }
        index += 1;
        continue;
      }

      if (!currentSection || countIndent(line) !== 2) {
        index += 1;
        continue;
      }

      var fieldMatch = line.match(/^  ([A-Za-z0-9_]+):(.*)$/);
      if (!fieldMatch) {
        index += 1;
        continue;
      }

      var field = parseScalar(lines, index, fieldMatch[2], 2);
      parsed[currentSection][fieldMatch[1]] = field.value;
      index = field.nextIndex;
    }

    return parsed;
  }

  function applyTextBindings(content) {
    eachNode("[data-content-text]", function(node) {
      var value = getValue(content, node.getAttribute("data-content-text"));
      if (hasValue(value)) {
        node.textContent = value;
      }
    });
  }

  function applyHtmlBindings(content) {
    eachNode("[data-content-html]", function(node) {
      var value = getValue(content, node.getAttribute("data-content-html"));
      if (hasValue(value)) {
        node.innerHTML = value;
      }
    });
  }

  function applyListBindings(content) {
    eachNode("[data-content-list]", function(node) {
      var value = getValue(content, node.getAttribute("data-content-list"));
      if (!hasValue(value)) {
        return;
      }

      var items = String(value)
        .split(/\s*,\s*/)
        .filter(function(item) {
          return item;
        });

      if (!items.length) {
        return;
      }

      var itemTag = node.getAttribute("data-content-item-tag") || "div";
      var itemClass = node.getAttribute("data-content-item-class") || "";

      node.innerHTML = "";
      items.forEach(function(item) {
        var child = document.createElement(itemTag);
        if (itemClass) {
          child.className = itemClass;
        }
        child.textContent = item;
        node.appendChild(child);
      });
    });
  }

  function applyMailtoBindings(content) {
    eachNode("[data-content-mailto]", function(node) {
      var email = getValue(content, node.getAttribute("data-content-mailto"));
      if (!hasValue(email)) {
        return;
      }

      var href = "mailto:" + email;
      var subject = node.getAttribute("data-mailto-subject");
      if (subject) {
        href += "?subject=" + encodeURIComponent(subject);
      }

      node.setAttribute("href", href);
    });
  }

  fetch("/_cms/content.yml", { cache: "no-store" })
    .then(function(response) {
      if (!response.ok) {
        throw new Error("Failed to load content YAML.");
      }
      return response.text();
    })
    .then(function(yamlText) {
      var parsed = parseContentYaml(yamlText);
      var content = parsed && parsed[sectionName];
      if (!content || typeof content !== "object") {
        return;
      }

      applyTextBindings(content);
      applyHtmlBindings(content);
      applyListBindings(content);
      applyMailtoBindings(content);
    })
    .catch(function(error) {
      console.warn("Prime content loader fallback:", error);
    });
})();
